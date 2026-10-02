#!/usr/bin/env node
/**
 * Source images: the files under src/ that pages import and the build resizes into
 * every width and format. Their size is what a build costs, so it is capped.
 *
 *   npm run images:check               fail on images over the limits (part of npm run check)
 *   npm run images:fix                 shrink them in place: same file, same format
 *   node scripts/images.mjs prune-cache  drop Astro image cache entries the last build didn't use (CI)
 *
 * Keep the full-resolution masters outside the repo (Drive, Figma); 2560px covers a
 * 1280px-wide slot on a 2x screen.
 */
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAX_EDGE = 2560;
const MAX_BYTES = 1024 * 1024;

const root = path.join(import.meta.dirname, "..");
const IMAGE = /\.(?:jpe?g|png|webp|avif|tiff?)$/i;
// Not the site's images: the Strapi app and generated code.
const SKIP = new Set([path.join(root, "src/modules/strapi/strapi"), path.join(root, "src/modules/.generated")]);

function* sourceImages(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !SKIP.has(full)) yield* sourceImages(full);
    } else if (IMAGE.test(entry.name)) yield full;
  }
}

async function inspect(file) {
  const { width = 0, height = 0, format } = await sharp(file).metadata();
  const bytes = statSync(file).size;
  const problems = [];
  if (Math.max(width, height) > MAX_EDGE) problems.push(`${width}x${height}px (max ${MAX_EDGE})`);
  if (bytes > MAX_BYTES) problems.push(`${(bytes / 1024 / 1024).toFixed(1)} MB (max ${MAX_BYTES / 1024 / 1024} MB)`);
  return { file, format, width, height, bytes, problems };
}

const relative = (file) => path.relative(root, file);

async function check() {
  const over = (await Promise.all([...sourceImages(path.join(root, "src"))].map(inspect))).filter((image) => image.problems.length);
  if (!over.length) return;
  for (const image of over) console.error(`  ${relative(image.file)}: ${image.problems.join(", ")}`);
  console.error(`\n${over.length} source image(s) over the limits. Run npm run images:fix; a PNG it can't shrink (a photo, a large logo) needs converting to .webp, .jpg or .svg, and its import updating.`);
  process.exitCode = 1;
}

/** Re-encodes in the file's own format, so imports keep working. */
function encode(pipeline, format) {
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality: 82, mozjpeg: true });
    case "png":
      // Lossless: sharp's PNG effort/quality options quantize to a 256-colour palette.
      return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
    case "webp":
      return pipeline.webp({ quality: 82, effort: 6 });
    case "avif":
      return pipeline.avif({ quality: 60, effort: 4 });
    case "tiff":
      return pipeline.tiff({ quality: 82, compression: "jpeg" });
    default:
      return null;
  }
}

async function fix() {
  let fixed = 0;
  for (const file of sourceImages(path.join(root, "src"))) {
    const image = await inspect(file);
    if (!image.problems.length) continue;
    // rotate(): bake in the EXIF orientation, which re-encoding strips with the rest of the metadata.
    const pipeline = encode(sharp(file).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }), image.format);
    if (!pipeline) continue;
    const output = await pipeline.toBuffer({ resolveWithObject: true });
    const resized = Math.max(image.width, image.height) > MAX_EDGE;
    // Not worth a changed file under 10% smaller.
    if (!resized && output.data.length > image.bytes * 0.9) continue;
    writeFileSync(file, output.data);
    fixed++;
    console.log(`  ${relative(file)}: ${image.width}x${image.height} ${(image.bytes / 1024) | 0} KB → ${output.info.width}x${output.info.height} ${(output.data.length / 1024) | 0} KB`);
  }
  console.log(`${fixed} image(s) rewritten.`);
  await check();
}

/**
 * Astro's image cache (node_modules/.astro/assets) names each entry after the file it
 * becomes in dist/client/_astro; entries the build didn't output are images or widths
 * that no longer exist. Remote images also have a .json entry beside them.
 */
function pruneCache() {
  const cache = path.join(root, "node_modules/.astro/assets");
  const output = path.join(root, "dist/client/_astro");
  if (!existsSync(cache) || !existsSync(output)) return;
  const used = new Set(readdirSync(output));
  let removed = 0;
  for (const name of readdirSync(cache)) {
    if (used.has(name.replace(/\.json$/, ""))) continue;
    rmSync(path.join(cache, name), { force: true });
    removed++;
  }
  console.log(`Image cache: ${readdirSync(cache).length} entries kept, ${removed} removed.`);
}

const command = process.argv[2];
if (command === "check") await check();
else if (command === "fix") await fix();
else if (command === "prune-cache") pruneCache();
else {
  console.error("Usage: node scripts/images.mjs check | fix | prune-cache");
  process.exitCode = 1;
}
