/**
 * File storage for uploads. The local driver writes under UPLOADS_DIR — mount a
 * persistent volume there in production (single replica). To move to S3/GCS
 * later, implement the same interface and swap `storage`.
 */
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { UPLOADS_DIR } from "astro:env/server";

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  bytes: number;
  modifiedAt: Date;
}

export interface Storage {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  /** Removes a key or a whole "folder" prefix. */
  remove(prefix: string): Promise<void>;
}

const base = path.resolve(UPLOADS_DIR);

/** Maps a key to a path inside the uploads dir; rejects traversal. */
function resolveKey(key: string): string {
  const resolved = path.resolve(base, key);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return resolved;
}

export const storage: Storage = {
  async put(key, data) {
    const file = resolveKey(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  },
  async get(key) {
    try {
      const file = resolveKey(key);
      const info = await stat(file);
      if (!info.isFile()) return null;
      return {
        body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
        bytes: info.size,
        modifiedAt: info.mtime,
      };
    } catch {
      return null;
    }
  },
  async remove(prefix) {
    await rm(resolveKey(prefix), { recursive: true, force: true });
  },
};
