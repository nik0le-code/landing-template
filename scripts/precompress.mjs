#!/usr/bin/env node
/**
 * Precompresses static assets after the build (gzip + brotli), so the server
 * sends them without compressing on every request. Runs as part of `npm run build`.
 */
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { constants, createBrotliCompress, createGzip } from "node:zlib";

const DIR = path.join(process.cwd(), "dist", "client");
const EXTENSIONS = /\.(?:html|css|js|mjs|json|xml|txt|svg|webmanifest)$/;
const MIN_BYTES = 1024;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (EXTENSIONS.test(entry.name) && statSync(full).size >= MIN_BYTES) yield full;
  }
}

let count = 0;
let saved = 0;
for await (const file of files(DIR)) {
  const original = statSync(file).size;
  await pipeline(createReadStream(file), createGzip({ level: 9 }), createWriteStream(`${file}.gz`));
  await pipeline(
    createReadStream(file),
    createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: original } }),
    createWriteStream(`${file}.br`),
  );
  count += 1;
  saved += original - statSync(`${file}.br`).size;
}
console.log(`Precompressed ${count} files (${(saved / 1024).toFixed(0)} KB smaller over the wire)`);
