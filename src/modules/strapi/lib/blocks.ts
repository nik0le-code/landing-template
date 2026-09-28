/**
 * Strapi's rich text ("blocks" field, JSON) → HTML for the site. Built from the JSON
 * rather than from editor-authored HTML, so every string is escaped and only these
 * elements can appear. h2/h3 get ids for the table of contents; an h1 in the content
 * becomes an h2 (the page has its own).
 */
import { slugify } from "@/lib/slug";
import { mediaUrl } from "./rest";

export interface StrapiMedia {
  url: string;
  alternativeText: string | null;
  width: number | null;
  height: number | null;
  formats?: Record<string, { url: string; width: number; height: number }> | null;
}

type Inline =
  | { type: "text"; text: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean }
  | { type: "link"; url: string; children: Inline[] };

type Block =
  | { type: "paragraph" | "quote" | "list-item"; children: Inline[] }
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "list"; format: "ordered" | "unordered"; children: Block[] }
  | { type: "code"; language?: string; children: Inline[] }
  | { type: "image"; image: StrapiMedia; children?: Inline[] };

export interface Heading {
  id: string;
  text: string;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only http(s), mailto, tel, site paths and anchors; anything else (javascript:) is dropped. */
const safeHref = (url: string) => (/^(https?:|mailto:|tel:|\/|#)/i.test(url.trim()) ? url.trim() : null);

const plainText = (children: Inline[]): string => children.map((child) => (child.type === "text" ? child.text : plainText(child.children))).join("");

function inline(children: Inline[]): string {
  return children
    .map((child) => {
      if (child.type === "link") {
        const href = safeHref(child.url);
        const inner = inline(child.children);
        if (!href) return inner;
        const external = /^https?:/i.test(href) ? ' rel="noopener"' : "";
        return `<a href="${escape(href)}"${external}>${inner}</a>`;
      }
      let html = escape(child.text).replace(/\n/g, "<br>");
      if (child.code) html = `<code>${html}</code>`;
      if (child.bold) html = `<strong>${html}</strong>`;
      if (child.italic) html = `<em>${html}</em>`;
      if (child.underline) html = `<u>${html}</u>`;
      if (child.strikethrough) html = `<s>${html}</s>`;
      return html;
    })
    .join("");
}

/** srcset from Strapi's renditions (small, medium, large) plus the original. */
export function srcsetOf(media: StrapiMedia): string | null {
  const widths = new Map<number, string>();
  for (const format of Object.values(media.formats ?? {})) if (format.width > 0 && !format.url.includes("thumbnail_")) widths.set(format.width, mediaUrl(format.url));
  if (media.width) widths.set(media.width, mediaUrl(media.url));
  return widths.size > 1 ? [...widths.entries()].sort(([a], [b]) => a - b).map(([width, url]) => `${url} ${width}w`).join(", ") : null;
}

export function renderBlocks(blocks: unknown): { html: string; headings: Heading[]; words: number } {
  const headings: Heading[] = [];
  const used = new Set<string>();
  let words = 0;

  const render = (block: Block): string => {
    switch (block.type) {
      case "paragraph": {
        const text = plainText(block.children);
        words += text.split(/\s+/).filter(Boolean).length;
        return text.trim() ? `<p>${inline(block.children)}</p>` : "";
      }
      case "heading": {
        const level = Math.min(6, Math.max(2, block.level));
        const text = plainText(block.children).trim();
        if (!text) return "";
        words += text.split(/\s+/).length;
        if (level > 3) return `<h${level}>${inline(block.children)}</h${level}>`;
        let id = slugify(text, 60) || `section-${headings.length + 1}`;
        for (let n = 2; used.has(id); n++) id = `${slugify(text, 56)}-${n}`;
        used.add(id);
        if (level === 2) headings.push({ id, text });
        return `<h${level} id="${id}">${inline(block.children)}</h${level}>`;
      }
      case "quote":
        words += plainText(block.children).split(/\s+/).filter(Boolean).length;
        return `<blockquote><p>${inline(block.children)}</p></blockquote>`;
      case "list-item":
        words += plainText(block.children).split(/\s+/).filter(Boolean).length;
        return `<li>${inline(block.children)}</li>`;
      case "list": {
        const tag = block.format === "ordered" ? "ol" : "ul";
        return `<${tag}>${block.children.map(render).join("")}</${tag}>`;
      }
      case "code":
        return `<pre><code>${escape(plainText(block.children))}</code></pre>`;
      case "image": {
        const media = block.image;
        if (!media?.url) return "";
        const srcset = srcsetOf(media);
        const size = media.width && media.height ? ` width="${media.width}" height="${media.height}"` : "";
        const set = srcset ? ` srcset="${escape(srcset)}" sizes="(min-width: 1024px) 48rem, 100vw"` : "";
        return `<figure><img src="${escape(mediaUrl(media.url))}"${set} alt="${escape(media.alternativeText ?? "")}"${size} loading="lazy" decoding="async"></figure>`;
      }
      default:
        return "";
    }
  };

  const html = Array.isArray(blocks) ? (blocks as Block[]).map(render).join("\n") : "";
  return { html, headings, words };
}
