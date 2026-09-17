#!/usr/bin/env node
/**
 * WordPress CLI for the wordpress module.
 *
 *   npm run wp:up [-- --demo]            local WordPress + WooCommerce in Docker, plugins from modules.config.ts
 *   npm run wp:plugins [-- --ssh user@host:/var/www/wordpress] [--force] [--prune]
 *   npm run wp:down [-- --volumes]       stop the local WordPress (--volumes also deletes its data)
 *   npm run wp -- plugin list            any WP-CLI command (local, or --ssh)
 *
 * `wordpress.plugins` in modules.config.ts is the list of plugins the site needs
 * (WooCommerce with `shop`, Polylang with content in several languages are added).
 * This installs and activates them; their settings are made in wp-admin as usual.
 * Plugins that aren't listed are reported, never removed (unless --prune).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import modulesConfig from "../modules.config";
import { siteConfig } from "../site.config";
import { mergeOptions } from "../src/modules/merge";
import { wordpressDefaults, type WordPressOptions, type WordPressPlugin } from "../src/modules/wordpress/options";

const ROOT = process.cwd();
// WORDPRESS_WEBHOOK_SECRET, SITE_URL, WORDPRESS_SSH… from .env, like the site reads them.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  // No .env: flags and the environment still work.
}
const COMPOSE = path.join(ROOT, "src/modules/wordpress/wordpress/compose.yml");
const PLUGINS_DIR = path.join(ROOT, "wordpress-plugins");

const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    ssh: { type: "string" },
    demo: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    prune: { type: "boolean", default: false },
    volumes: { type: "boolean", default: false },
    port: { type: "string" },
    "site-url": { type: "string" },
  },
});
const [command] = positionals;

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const info = (message: string) => console.log(`• ${message}`);
const done = (message: string) => console.log(`✓ ${message}`);

// ---------------------------------------------------------------- config

interface PluginSpec {
  slug: string;
  version?: string;
  zip?: string;
  activate: boolean;
}

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

const options = () =>
  mergeOptions(wordpressDefaults as unknown as Record<string, unknown>, modulesConfig.options?.wordpress as Record<string, unknown> | undefined) as unknown as WordPressOptions;
const multilingualContent = () => {
  const { content } = options();
  return siteConfig.locales.length > 1 && (content.posts || content.pages);
};

function pluginSpecs(): PluginSpec[] {
  const configured = (options().plugins as WordPressPlugin[]).map((entry): PluginSpec => {
    const spec = typeof entry === "string" ? { slug: entry.split("@")[0]!, version: entry.split("@")[1] } : entry;
    if (!SLUG.test(spec.slug)) fail(`Invalid plugin slug in modules.config.ts: "${spec.slug}"`);
    if (spec.version && !/^[\w.-]+$/.test(spec.version)) fail(`Invalid version for ${spec.slug}: "${spec.version}"`);
    return { slug: spec.slug, version: spec.version || undefined, zip: "zip" in spec ? spec.zip : undefined, activate: "activate" in spec ? spec.activate !== false : true };
  });
  // Required by the site's options; listing them only matters to pin a version.
  const required = [...(options().shop ? ["woocommerce"] : []), ...(multilingualContent() ? ["polylang"] : [])];
  return [...required.filter((slug) => !configured.some((p) => p.slug === slug)).map((slug) => ({ slug, activate: true })), ...configured];
}

// ---------------------------------------------------------------- targets

interface Target {
  label: string;
  /** Runs WP-CLI and returns stdout; throws with its output on failure. */
  wp(args: string[], options?: { quiet?: boolean }): string;
  /** Makes a zip from wordpress-plugins/ available to WP-CLI and returns the path it sees. */
  zipPath(file: string): string;
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

function run(bin: string, args: string[], quiet = false): string {
  const result = spawnSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) throw result.error;
  // WordPress in Docker prints harmless PHP notices from CLI context; keep real errors.
  const stderr = result.stderr.split("\n").filter((line) => line && !/HTTP_HOST|sendmail|wp-cli\/cache|Failed to create directory/.test(line)).join("\n");
  if (result.status !== 0) throw new Error(`${stderr}\n${result.stdout}`.trim());
  if (stderr && !quiet) console.error(stderr);
  return result.stdout.trim();
}

function localTarget(): Target {
  return {
    label: "local WordPress (Docker)",
    wp: (args, options) => run("docker", ["compose", "-f", COMPOSE, "exec", "-T", "cli", "wp", ...args], options?.quiet),
    zipPath(file) {
      const relative = path.relative(PLUGINS_DIR, path.resolve(ROOT, file));
      if (relative.startsWith("..")) fail(`Zip plugins for the local WordPress must be inside wordpress-plugins/: ${file}`);
      return `/plugins/${relative.split(path.sep).join("/")}`;
    },
  };
}

/** `user@host:/path/to/wordpress` (the server needs WP-CLI; `ssh` must log in without a prompt). */
function sshTarget(spec: string): Target {
  const match = /^([^:]+):(\/.*)$/.exec(spec);
  if (!match) fail(`--ssh expects user@host:/path/to/wordpress, got "${spec}"`);
  const [, host, wordpressPath] = match!;
  return {
    label: `${host}:${wordpressPath}`,
    wp: (args, options) => run("ssh", [host!, `cd ${shellQuote(wordpressPath!)} && wp ${args.map(shellQuote).join(" ")}`], options?.quiet),
    zipPath(file) {
      const local = path.resolve(ROOT, file);
      if (!existsSync(local)) fail(`Zip not found: ${file}`);
      const remote = `/tmp/${path.basename(local)}`;
      run("scp", ["-q", local, `${host}:${remote}`]);
      return remote;
    },
  };
}

const target = (): Target => (flags.ssh || process.env.WORDPRESS_SSH ? sshTarget(String(flags.ssh ?? process.env.WORDPRESS_SSH)) : localTarget());

// ---------------------------------------------------------------- plugins

interface InstalledPlugin {
  name: string;
  status: string;
  version: string;
}

function syncPlugins(t: Target) {
  const specs = pluginSpecs(); // validates the config before touching WordPress
  info(`Syncing plugins on ${t.label}`);
  const installed = new Map((JSON.parse(t.wp(["plugin", "list", "--format=json", "--fields=name,status,version"])) as InstalledPlugin[]).map((p) => [p.name, p]));
  let failures = 0;

  for (const spec of specs) {
    const current = installed.get(spec.slug);
    try {
      if (spec.zip) {
        if (!current || flags.force) {
          const source = /^https?:\/\//.test(spec.zip) ? spec.zip : t.zipPath(spec.zip);
          t.wp(["plugin", "install", source, "--force"], { quiet: true });
          done(`${spec.slug}: installed from ${spec.zip}`);
        }
      } else if (!current) {
        t.wp(["plugin", "install", spec.slug, ...(spec.version ? [`--version=${spec.version}`] : [])], { quiet: true });
        done(`${spec.slug}: installed${spec.version ? ` ${spec.version}` : ""}`);
      } else if (spec.version && current.version !== spec.version) {
        t.wp(["plugin", "install", spec.slug, `--version=${spec.version}`, "--force"], { quiet: true });
        done(`${spec.slug}: ${current.version} → ${spec.version}`);
      }

      const status = t.wp(["plugin", "get", spec.slug, "--field=status"], { quiet: true });
      if (spec.activate && status !== "active") {
        t.wp(["plugin", "activate", spec.slug], { quiet: true });
        done(`${spec.slug}: activated`);
      } else if (!spec.activate && status === "active") {
        t.wp(["plugin", "deactivate", spec.slug], { quiet: true });
        done(`${spec.slug}: deactivated (activate: false)`);
      } else if (current && !(spec.version && current.version !== spec.version)) {
        info(`${spec.slug}: up to date (${current.version}, ${status})`);
      }
    } catch (error) {
      failures++;
      console.error(`✗ ${spec.slug}: ${(error as Error).message.split("\n").find((line) => /error/i.test(line)) ?? (error as Error).message}`);
    }
  }

  const listed = new Set(specs.map((s) => s.slug));
  const extra = [...installed.values()].filter((p) => !listed.has(p.name) && p.status !== "must-use" && p.status !== "dropin");
  if (extra.length && flags.prune) {
    for (const plugin of extra) {
      t.wp(["plugin", "deactivate", plugin.name], { quiet: true });
      t.wp(["plugin", "delete", plugin.name], { quiet: true });
      done(`${plugin.name}: removed (--prune)`);
    }
  } else if (extra.length) {
    info(`Installed but not in modules.config.ts: ${extra.map((p) => `${p.name} (${p.status})`).join(", ")}. Add them, or run with --prune to remove.`);
  }
  if (failures) fail(`${failures} plugin(s) failed.`);
  done("Plugins match modules.config.ts. Configure them in wp-admin.");
}

// ---------------------------------------------------------------- local WordPress

function dockerAvailable() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Shop demo: products with variations, shipping, offline payments, a coupon. */
const DEMO_SHOP = `
if ( get_option( 'landing_demo_shop' ) ) { echo "already there\\n"; return; }
$cat = fn( $name ) => ( get_term_by( 'name', $name, 'product_cat' ) ?: (object) array( 'term_id' => wp_insert_term( $name, 'product_cat' )['term_id'] ) )->term_id;
$attr = function ( $name, $terms ) {
  $id = wc_attribute_taxonomy_id_by_name( $name ) ?: wc_create_attribute( array( 'name' => $name ) );
  $tax = wc_attribute_taxonomy_name( $name );
  register_taxonomy( $tax, 'product' );
  foreach ( $terms as $t ) if ( ! term_exists( $t, $tax ) ) wp_insert_term( $t, $tax );
  $a = new WC_Product_Attribute(); $a->set_id( $id ); $a->set_name( $tax );
  $a->set_options( array_map( fn( $t ) => get_term_by( 'name', $t, $tax )->term_id, $terms ) ); $a->set_visible( true ); $a->set_variation( true );
  return $a;
};
$chairs = $cat( 'Chairs' ); $tables = $cat( 'Tables' );
$simple = function ( $name, $price, $sale, $cat, $stock = 'instock' ) { $p = new WC_Product_Simple(); $p->set_name( $name ); $p->set_regular_price( $price ); if ( $sale ) $p->set_sale_price( $sale ); $p->set_stock_status( $stock ); $p->set_category_ids( array( $cat ) ); $p->set_description( '<p>Demo product.</p>' ); return $p->save(); };
$simple( 'Oak Stool', '49', '39', $chairs ); $simple( 'Dining Table', '420', '', $tables ); $simple( 'Garden Bench', '150', '', $chairs, 'outofstock' );
$p = new WC_Product_Variable(); $p->set_name( 'Lounge Chair' ); $p->set_category_ids( array( $chairs ) ); $p->set_description( '<p>Demo product with variations.</p>' );
$p->set_attributes( array( $attr( 'Color', array( 'Oak', 'Walnut', 'Black' ) ), $attr( 'Size', array( 'Small', 'Large' ) ) ) ); $pid = $p->save();
foreach ( array( 'oak', 'walnut', 'black' ) as $c ) foreach ( array( 'small', 'large' ) as $s ) {
  $v = new WC_Product_Variation(); $v->set_parent_id( $pid ); $v->set_attributes( array( 'pa_color' => $c, 'pa_size' => $s ) );
  $v->set_regular_price( 'large' === $s ? '260' : '199' ); if ( 'walnut' === $c ) $v->set_sale_price( 'large' === $s ? '230' : '179' );
  $v->set_stock_status( 'black' === $c && 'large' === $s ? 'outofstock' : 'instock' ); $v->save();
}
WC_Product_Variable::sync( $pid );
$zone = new WC_Shipping_Zone(); $zone->set_zone_name( 'Greece' ); $zone->set_locations( array( array( 'code' => 'GR', 'type' => 'country' ) ) ); $zone->save();
$rate = $zone->add_shipping_method( 'flat_rate' ); update_option( "woocommerce_flat_rate_{$rate}_settings", array( 'title' => 'Flat rate', 'cost' => '5', 'tax_status' => 'none', 'enabled' => 'yes' ) );
$zone->add_shipping_method( 'local_pickup' );
foreach ( array( 'cod', 'bacs' ) as $g ) { $o = get_option( "woocommerce_{$g}_settings", array() ); $o['enabled'] = 'yes'; update_option( "woocommerce_{$g}_settings", $o ); }
$c = new WC_Coupon(); $c->set_code( 'welcome10' ); $c->set_discount_type( 'percent' ); $c->set_amount( 10 ); $c->save();
update_option( 'landing_demo_shop', 1 );
echo "created\\n";
`;

/** Content demo: a post and a page in every language, linked as translations when Polylang is there. */
const demoContent = (locales: readonly string[]) => `
if ( get_option( 'landing_demo_content' ) ) { echo "already there\\n"; return; }
$locales = json_decode( '${JSON.stringify(locales)}', true );
$copy = array(
  'el' => array( 'post' => array( 'Καλώς ήρθατε στο νέο μας site', 'kalos-irthate', '<p>Αυτό το άρθρο γράφτηκε στο WordPress και εμφανίζεται με το design του site.</p><h2>Πώς λειτουργεί</h2><p>Κάθε δημοσίευση καθαρίζει την cache αμέσως.</p><h2>Μεταφράσεις</h2><p>Οι μεταφράσεις συνδέονται με το Polylang.</p><h2>Εικόνες</h2><p>Οι εικόνες φορτώνονται από το WordPress σε πολλά μεγέθη.</p>' ), 'page' => array( 'Η ομάδα μας', 'omada', '<p>Μια σελίδα από το WordPress.</p>' ), 'category' => array( 'Νέα', 'nea' ) ),
  'en' => array( 'post' => array( 'Welcome to our new site', 'welcome', '<p>This article was written in WordPress and is shown with the site\\'s design.</p><h2>How it works</h2><p>Every publish clears the cache right away.</p><h2>Translations</h2><p>Translations are linked with Polylang.</p><h2>Images</h2><p>Images load from WordPress in several sizes.</p>' ), 'page' => array( 'Our team', 'team', '<p>A page from WordPress.</p>' ), 'category' => array( 'News', 'news' ) ),
);
$posts = array(); $pages = array(); $terms = array();
foreach ( $locales as $lang ) {
  $c = $copy[ $lang ] ?? $copy['en'];
  $term = wp_insert_term( $c['category'][0], 'category', array( 'slug' => $c['category'][1] ) );
  $term_id = is_wp_error( $term ) ? (int) $term->get_error_data() : $term['term_id'];
  $posts[ $lang ] = wp_insert_post( array( 'post_title' => $c['post'][0], 'post_name' => $c['post'][1], 'post_content' => $c['post'][2], 'post_excerpt' => wp_strip_all_tags( $c['post'][2] ) === '' ? '' : mb_substr( wp_strip_all_tags( $c['post'][2] ), 0, 90 ), 'post_status' => 'publish', 'post_category' => array( $term_id ) ) );
  $pages[ $lang ] = wp_insert_post( array( 'post_title' => $c['page'][0], 'post_name' => $c['page'][1], 'post_content' => $c['page'][2], 'post_status' => 'publish', 'post_type' => 'page' ) );
  $terms[ $lang ] = $term_id;
  if ( function_exists( 'pll_set_post_language' ) ) { pll_set_post_language( $posts[ $lang ], $lang ); pll_set_post_language( $pages[ $lang ], $lang ); pll_set_term_language( $term_id, $lang ); }
}
if ( function_exists( 'pll_save_post_translations' ) ) { pll_save_post_translations( $posts ); pll_save_post_translations( $pages ); pll_save_term_translations( $terms ); }
update_option( 'landing_demo_content', 1 );
echo "created\\n";
`;

/** Polylang languages for the site's locales, directory URLs, default language without prefix. */
const setupPolylang = (locales: readonly string[], defaultLocale: string) => `
if ( ! function_exists( 'PLL' ) ) { echo "polylang not active\\n"; return; }
$names = array( 'el' => array( 'Ελληνικά', 'el', 'gr' ), 'en' => array( 'English', 'en_US', 'us' ), 'de' => array( 'Deutsch', 'de_DE', 'de' ), 'fr' => array( 'Français', 'fr_FR', 'fr' ), 'it' => array( 'Italiano', 'it_IT', 'it' ), 'es' => array( 'Español', 'es_ES', 'es' ) );
$model = PLL()->model;
foreach ( json_decode( '${JSON.stringify(locales)}', true ) as $order => $slug ) {
  if ( $model->get_language( $slug ) ) continue;
  $n = $names[ $slug ] ?? array( strtoupper( $slug ), $slug, '' );
  $model->add_language( array( 'name' => $n[0], 'slug' => $slug, 'locale' => $n[1], 'rtl' => 0, 'term_group' => $order, 'flag' => $n[2] ) );
}
$model->clean_languages_cache();
$options = get_option( 'polylang' );
$options['default_lang'] = '${defaultLocale}';
$options['force_lang'] = 1;      // language from the directory: /en/...
$options['hide_default'] = 1;    // default language without a prefix, like the site's links minus its prefix
$options['rewrite'] = 1;         // no /language/ in URLs
$options['post_types'] = array();
update_option( 'polylang', $options );
if ( method_exists( $model, 'set_language_in_mass' ) ) $model->set_language_in_mass();
flush_rewrite_rules();
echo "languages: " . implode( ', ', pll_languages_list() ) . "\\n";
`;

function up() {
  if (!dockerAvailable()) fail("Docker is not running. Start Docker Desktop and try again.");
  const port = String(flags.port ?? process.env.WORDPRESS_PORT ?? "8088");
  const siteUrl = String(flags["site-url"] ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const wordpressUrl = `http://localhost:${port}`;
  const { shop, content, postsPath } = options();

  info(`Starting WordPress on ${wordpressUrl}`);
  execFileSync("docker", ["compose", "-f", COMPOSE, "up", "-d", "--wait"], { stdio: "inherit", env: { ...process.env, WORDPRESS_PORT: port } });

  const t = localTarget();
  for (let attempt = 0; ; attempt++) {
    try {
      t.wp(["db", "check"], { quiet: true });
      break;
    } catch {
      if (attempt > 60) fail("The WordPress database did not come up.");
      execFileSync("sleep", ["2"]);
    }
  }

  let fresh = false;
  try {
    t.wp(["core", "is-installed"], { quiet: true });
  } catch {
    fresh = true;
    t.wp(["core", "install", `--url=${wordpressUrl}`, "--title=Site", "--admin_user=admin", "--admin_password=admin", "--admin_email=admin@example.com", "--skip-email"], { quiet: true });
    // WordPress's sample post, comment and page would show up on the site.
    t.wp(["post", "delete", "1", "2", "--force"], { quiet: true });
    done("WordPress installed (admin / admin)");
  }

  // Permalinks that mirror the site's paths, so links in content map to site pages:
  // posts /<postsPath>/<slug>/, categories /<postsPath>/category/<slug>/, pages by path.
  t.wp(["rewrite", "structure", `/${postsPath}/%postname%/`], { quiet: true });
  t.wp(["option", "update", "category_base", `${postsPath}/category`], { quiet: true });
  t.wp(["option", "update", "timezone_string", process.env.TZ || "Europe/Athens"], { quiet: true });

  // The bridge: where to send shoppers and change notifications, and the shared secret.
  const secret = process.env.WORDPRESS_WEBHOOK_SECRET || randomBytes(24).toString("base64url");
  t.wp(["config", "set", "HEADLESS_SITE_URL", siteUrl], { quiet: true });
  t.wp(["config", "set", "HEADLESS_WEBHOOK_SECRET", secret], { quiet: true });
  // WordPress runs in Docker: "localhost" there is the container, so notifications go to the host.
  const webhookUrl = new URL("/api/wordpress/webhook", siteUrl);
  if (["localhost", "127.0.0.1"].includes(webhookUrl.hostname)) webhookUrl.hostname = "host.docker.internal";
  t.wp(["config", "set", "HEADLESS_WEBHOOK_URL", webhookUrl.toString()], { quiet: true });

  syncPlugins(t);

  if (multilingualContent()) info(`Polylang: ${t.wp(["eval", setupPolylang(siteConfig.locales, siteConfig.defaultLocale)], { quiet: true })}`);
  t.wp(["rewrite", "flush"], { quiet: true });

  if (shop) {
    t.wp(["option", "update", "woocommerce_coming_soon", "no"], { quiet: true });
    t.wp(["option", "update", "woocommerce_default_country", "GR"], { quiet: true });
    t.wp(["option", "update", "woocommerce_currency", "EUR"], { quiet: true });
  }
  if (flags.demo) {
    if (content.posts || content.pages) info(`Demo content: ${t.wp(["eval", demoContent(multilingualContent() ? siteConfig.locales : [siteConfig.defaultLocale])], { quiet: true })}`);
    if (shop) info(`Demo shop: ${t.wp(["eval", DEMO_SHOP], { quiet: true })}`);
  }

  console.log(`
${fresh ? "WordPress is ready." : "WordPress is running."}
  wp-admin   ${wordpressUrl}/wp-admin   (admin / admin)
  site       ${siteUrl}

In .env:
  WORDPRESS_URL=${wordpressUrl}
  WORDPRESS_WEBHOOK_SECRET=${secret}

In modules.config.ts: wordpress: true${shop ? " (shop on)" : ""}.
Plugin settings (payment credentials, emails, SEO) are made in wp-admin.`);
}

// ---------------------------------------------------------------- main

switch (command) {
  case "up":
    up();
    break;
  case "plugins":
    syncPlugins(target());
    break;
  case "down":
    execFileSync("docker", ["compose", "-f", COMPOSE, "down", ...(flags.volumes ? ["--volumes"] : [])], { stdio: "inherit" });
    break;
  case "cli": {
    // Everything after "cli" goes to WP-CLI untouched, except this script's own --ssh.
    const raw = process.argv.slice(process.argv.indexOf("cli") + 1).filter((arg, i, all) => !arg.startsWith("--ssh") && all[i - 1] !== "--ssh");
    if (!raw.length) fail("Usage: npm run wp -- <wp-cli command>, e.g. npm run wp -- plugin list");
    console.log(target().wp(raw));
    break;
  }
  default:
    fail("Usage: npm run wp:up | wp:plugins | wp:down | wp -- <wp-cli command>");
}
