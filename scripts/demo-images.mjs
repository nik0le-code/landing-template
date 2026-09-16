#!/usr/bin/env node
/**
 * Fetches neutral placeholder photography for the demo pages (src/assets/demo).
 * Replace these with the client's own photos; run `npm run demo:images` to refresh.
 *
 * Real photos on purpose: generated gradient blobs are the clearest sign of a page
 * nobody art-directed. Offline, it falls back to a plain paper-toned card so the
 * build still works.
 */
import sharp from "sharp";

const out = new URL("../src/assets/demo/", import.meta.url);

/** picsum.photos is deterministic per seed, so builds stay reproducible. */
const shots = [
  { name: "hero.jpg", seed: "workshop-desk", width: 1600, height: 1000 },
  { name: "about.jpg", seed: "studio-team", width: 1200, height: 900 },
  { name: "gallery-1.jpg", seed: "architecture-detail", width: 900, height: 1200 },
  { name: "gallery-2.jpg", seed: "workbench-tools", width: 900, height: 700 },
  { name: "gallery-3.jpg", seed: "meeting-room", width: 900, height: 700 },
  { name: "gallery-4.jpg", seed: "city-window", width: 900, height: 1200 },
  { name: "gallery-5.jpg", seed: "paper-notes", width: 900, height: 700 },
  { name: "gallery-6.jpg", seed: "warehouse-shelves", width: 900, height: 700 },
];

async function fetchPhoto({ seed, width, height }) {
  const url = `https://picsum.photos/seed/${seed}/${width}/${height}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function fallback(width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#efece7"/>
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#d8d3cb"/>
  </svg>`;
  return Buffer.from(svg);
}

for (const shot of shots) {
  let input;
  try {
    input = await fetchPhoto(shot);
  } catch (error) {
    console.warn(`! ${shot.name}: ${error.message} - writing a plain placeholder instead`);
    input = fallback(shot.width, shot.height);
  }
  await sharp(input)
    .resize(shot.width, shot.height, { fit: "cover" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(new URL(shot.name, out).pathname);
}

console.log(`Demo images written to src/assets/demo/ (${shots.length} files)`);
