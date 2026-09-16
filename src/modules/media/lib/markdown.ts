/**
 * Markdown → sanitized HTML for rich content (blog posts, catalog items), done once
 * when content is saved.
 *
 * - `![alt](media:<id>)` becomes a responsive <picture> from the media library
 *   (AVIF/WebP srcset, intrinsic size, no layout shift).
 * - h2/h3 get stable ids for anchors; h2s feed the table of contents.
 * - External links open with rel="noopener noreferrer nofollow".
 * - Output is sanitized with an allowlist, so even a compromised editor account
 *   can't inject scripts into public pages.
 */
import { Marked, type Tokens } from "marked";
import sanitizeHtml from "sanitize-html";
import { slugify } from "@/lib/slug";
import type { MediaFile } from "../db/schema";
import { getMediaMap } from "./queries";
import { mediaUrl, srcset } from "./urls";

export interface RenderedMarkdown {
  html: string;
  headings: { id: string; text: string }[];
  readingMinutes: number;
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function pictureHtml(media: MediaFile, alt: string) {
  const fallback = media.variants.find((v) => v.format === "jpeg" || v.format === "png") ?? media.variants.at(-1)!;
  const sizes = "(min-width: 768px) 70ch, 100vw";
  return (
    `<picture><source type="image/avif" srcset="${srcset(media, "avif")}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${srcset(media, "webp")}" sizes="${sizes}">` +
    `<img src="${mediaUrl(fallback.key)}" alt="${escapeAttr(alt || media.alt)}" width="${media.width}" height="${media.height}" loading="lazy" decoding="async"></picture>`
  );
}

export async function renderMarkdown(markdown: string): Promise<RenderedMarkdown> {
  const mediaIds = [...markdown.matchAll(/\]\(media:([0-9a-f-]{36})\)/g)].map((match) => match[1]!);
  const media = await getMediaMap(mediaIds);
  const headings: RenderedMarkdown["headings"] = [];
  const usedIds = new Set<string>();

  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const text = token.text.replace(/<[^>]+>/g, "");
        // The post title is the page's h1, so content headings start at h2.
        const depth = Math.max(2, token.depth);
        if (depth > 3) return `<h${depth}>${inner}</h${depth}>`;
        let id = slugify(text) || "section";
        for (let n = 2; usedIds.has(id); n++) id = `${slugify(text) || "section"}-${n}`;
        usedIds.add(id);
        if (depth === 2) headings.push({ id, text });
        return `<h${depth} id="${id}">${inner}</h${depth}>`;
      },
      image(token: Tokens.Image) {
        const match = /^media:([0-9a-f-]{36})$/.exec(token.href);
        if (match) {
          const file = media.get(match[1]!);
          return file ? pictureHtml(file, token.text) : "";
        }
        return `<img src="${escapeAttr(token.href)}" alt="${escapeAttr(token.text)}" loading="lazy" decoding="async">`;
      },
      link(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens);
        const external = /^https?:\/\//.test(token.href);
        const rel = external ? ' rel="noopener noreferrer nofollow" target="_blank"' : "";
        return `<a href="${escapeAttr(token.href)}"${rel}>${inner}</a>`;
      },
    },
  });

  const raw = await marked.parse(markdown);
  const html = sanitizeHtml(raw, {
    allowedTags: [
      "h2", "h3", "h4", "p", "br", "hr", "strong", "em", "del", "blockquote", "code", "pre", "ul", "ol", "li",
      "a", "img", "picture", "source", "table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "rel", "target"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      source: ["type", "srcset", "sizes"],
      h2: ["id"],
      h3: ["id"],
      th: ["align"],
      td: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    // Safety net for raw HTML h1s: the post title is the page's only h1.
    transformTags: { h1: "h2" },
  });

  const words = markdown.replace(/[#*_`>\[\]()!-]/g, " ").split(/\s+/).filter(Boolean).length;
  return { html, headings, readingMinutes: Math.max(1, Math.round(words / 200)) };
}
