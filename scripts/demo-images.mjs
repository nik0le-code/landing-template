#!/usr/bin/env node
/** Generates abstract placeholder images for the demo pages (src/assets/demo). Replace with real photos per client. */
import sharp from "sharp";

const out = new URL("../src/assets/demo/", import.meta.url);
const palettes = [
  ["#4f46e5", "#06b6d4"],
  ["#0ea5e9", "#22c55e"],
  ["#f97316", "#ec4899"],
  ["#8b5cf6", "#0ea5e9"],
  ["#14b8a6", "#6366f1"],
  ["#eab308", "#ef4444"],
];

async function make(name, width, height, [a, b], seed) {
  const circles = Array.from({ length: 5 }, (_, i) => {
    const x = ((seed * 97 + i * 211) % 100) / 100;
    const y = ((seed * 53 + i * 131) % 100) / 100;
    const r = 0.15 + (((seed + i) * 37) % 30) / 100;
    return `<circle cx="${x * width}" cy="${y * height}" r="${r * Math.max(width, height)}" fill="${i % 2 ? a : b}" opacity="0.35"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="${width / 20}"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#blur)">${circles}</g></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(new URL(name, out).pathname);
}

await make("hero.jpg", 1600, 1000, palettes[0], 1);
await make("about.jpg", 1200, 900, palettes[1], 2);
for (let i = 0; i < 6; i++) await make(`gallery-${i + 1}.jpg`, 1200, 900, palettes[i], i + 3);
console.log("Demo images written to src/assets/demo/");
