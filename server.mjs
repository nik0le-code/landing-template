#!/usr/bin/env node
/**
 * Production server: static files + the Astro handler, with security headers,
 * compression and cache headers applied to everything (the standalone adapter
 * can't add headers to static files).
 *
 *   node server.mjs        (PORT, HOST, NOINDEX, TRUST_PROXY…)
 */
import { createServer } from "node:http";
import { createBrotliCompress, createGzip } from "node:zlib";
import { pipeline } from "node:stream";
import path from "node:path";
import sirv from "sirv";
import { handler as astroHandler } from "./dist/server/entry.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const NOINDEX = process.env.NOINDEX === "true";
const CLIENT_DIR = path.join(import.meta.dirname, "dist", "client");

/** Applied to every response, including static files. */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  // Only meaningful over HTTPS; browsers ignore it on plain HTTP.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

const COMPRESSIBLE = /^(?:text\/|application\/(?:json|xml|rss\+xml|manifest\+json|javascript|x-javascript)|image\/svg\+xml)/;
const MIN_COMPRESS_BYTES = 1024;

/**
 * Compresses text responses that aren't already encoded. Static assets are served
 * precompressed by sirv (see scripts/precompress.mjs), so this mostly covers
 * server-rendered HTML, JSON and XML.
 */
function withCompression(req, res) {
  const accepted = req.headers["accept-encoding"] ?? "";
  const encoding = /\bbr\b/.test(accepted) ? "br" : /\bgzip\b/.test(accepted) ? "gzip" : null;
  if (!encoding || req.method === "HEAD") return res;

  const originalWriteHead = res.writeHead.bind(res);
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let stream = null;

  res.writeHead = (status, ...rest) => {
    const type = res.getHeader("content-type");
    const length = Number(res.getHeader("content-length") ?? Infinity);
    const alreadyEncoded = res.getHeader("content-encoding");
    if (!alreadyEncoded && typeof type === "string" && COMPRESSIBLE.test(type) && length >= MIN_COMPRESS_BYTES) {
      res.removeHeader("content-length");
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Vary", [res.getHeader("vary"), "Accept-Encoding"].filter(Boolean).join(", "));
      stream = encoding === "br" ? createBrotliCompress({ params: { 1: 5 } }) : createGzip({ level: 6 });
      pipeline(stream, { write: originalWrite, end: originalEnd, on() {}, once() {}, emit() {} }, () => {});
    }
    return originalWriteHead(status, ...rest);
  };
  res.write = (chunk, ...rest) => (stream ? stream.write(chunk, ...rest) : originalWrite(chunk, ...rest));
  res.end = (chunk, ...rest) => {
    if (!stream) return originalEnd(chunk, ...rest);
    if (chunk) stream.write(chunk);
    stream.end();
    return res;
  };
  return res;
}

const serveStatic = sirv(CLIENT_DIR, {
  etag: true,
  brotli: true,
  gzip: true,
  setHeaders(res, pathname) {
    // Hashed assets and generated font files never change under the same URL.
    const immutable = pathname.startsWith("/_astro/") || /\.(?:woff2?|ttf|otf)$/.test(pathname);
    res.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  },
});

createServer((req, res) => {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(header, value);
  if (NOINDEX) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  withCompression(req, res);
  serveStatic(req, res, () => astroHandler(req, res));
}).listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
