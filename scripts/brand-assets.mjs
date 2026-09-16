#!/usr/bin/env node
/**
 * Generates raster brand assets from public/favicon.svg + site.config.ts:
 *   favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, og-default.png
 *
 * Usage: npm run brand:assets
 * Replace public/favicon.svg (square) with the client's mark first. For a
 * designed OG image, just overwrite public/og-default.png (1200×630) afterwards.
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { siteConfig } from "../site.config.ts";

const pub = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", pub));

const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

// ICO container holding a single 32×32 PNG (supported by every current browser).
const ico32 = await png(32);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(32, 6); // width
header.writeUInt8(32, 7); // height
header.writeUInt16LE(1, 10); // color planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(ico32.length, 14); // data size
header.writeUInt32LE(22, 18); // data offset
await writeFile(new URL("favicon.ico", pub), Buffer.concat([header, ico32]));

await writeFile(new URL("apple-touch-icon.png", pub), await png(180));
await writeFile(new URL("icon-192.png", pub), await png(192));
await writeFile(new URL("icon-512.png", pub), await png(512));

const escape = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
const og = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${siteConfig.themeColor}"/>
  <text x="96" y="370" font-family="Inter, Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff">${escape(siteConfig.name)}</text>
  <text x="96" y="450" font-family="Inter, Arial, sans-serif" font-size="36" fill="#cbd5e1">${escape(siteConfig.description[siteConfig.defaultLocale])}</text>
</svg>`);
const logo = await sharp(svg, { density: 384 }).resize(128, 128).png().toBuffer();
await sharp(og)
  .composite([{ input: logo, top: 110, left: 96 }])
  .png({ compressionLevel: 9 })
  .toFile(new URL("og-default.png", pub).pathname);

console.log("Brand assets written to public/");
