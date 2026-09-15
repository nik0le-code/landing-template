/**
 * Upload pipeline: validate → resize → store → record. All image work happens once,
 * at upload time, so serving is a plain file read (no per-request CPU). This is the
 * only file that loads sharp.
 */
import sharp, { type Metadata } from "sharp";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { getModuleOptions } from "@/modules/registry";
import { mediaFiles, type MediaFile, type MediaVariant } from "../db/schema";
import { mediaDefaults } from "../options";
import { storage } from "./storage";

/** Formats accepted as input, detected by decoding — never by extension or MIME. */
const ACCEPTED_INPUT = new Set(["jpeg", "png", "webp", "gif", "tiff", "heif"]);
/** 100 MP: generous for photos, blocks decompression bombs. */
const MAX_INPUT_PIXELS = 100_000_000;
/** Fallback <img> size for browsers without AVIF/WebP. */
const FALLBACK_MAX_WIDTH = 1280;

export class MediaError extends Error {
  constructor(
    public readonly code: "tooLarge" | "unsupported" | "invalid",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const mediaOptions = () => getModuleOptions("media", mediaDefaults);

function hex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export async function processUpload(file: File, userId: string | null): Promise<MediaFile> {
  const options = mediaOptions();
  if (file.size > options.maxUploadMb * 1024 * 1024) throw new MediaError("tooLarge");

  const input = new Uint8Array(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new MediaError("invalid");
  }
  if (!metadata.format || !ACCEPTED_INPUT.has(metadata.format)) throw new MediaError("unsupported");

  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (!width || !height) throw new MediaError("invalid");
  const hasAlpha = Boolean(metadata.hasAlpha);
  sharp.concurrency(options.threads);
  // Uploads are rare and never repeat the same operation: libvips' operation cache
  // would only hold on to memory on small nodes.
  sharp.cache(false);

  // Decode once: auto-orient (EXIF), first frame only, pre-shrunk to the largest
  // width we'll emit. Every variant is resized from this raw buffer, so the
  // original is never decoded twice. Metadata (GPS etc.) is dropped by re-encoding.
  const maxWidth = Math.min(width, Math.max(...options.widths));
  const { data: raw, info: rawInfo } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .autoOrient()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = () => sharp(raw, { raw: { width: rawInfo.width, height: rawInfo.height, channels: rawInfo.channels } });
  const { dominant } = await base().stats();

  const id = crypto.randomUUID();
  const widths = [...new Set([...options.widths.filter((w) => w < maxWidth), maxWidth])].sort((a, b) => a - b);
  const variants: MediaVariant[] = [];

  try {
    for (const targetWidth of widths) {
      const resized = () => base().resize({ width: targetWidth, withoutEnlargement: true });
      for (const format of ["avif", "webp"] as const) {
        const encoded =
          format === "avif"
            ? resized().avif({ quality: options.quality.avif, effort: 2 })
            : resized().webp({ quality: options.quality.webp, effort: 4 });
        const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
        const key = `${id}/${targetWidth}.${format}`;
        await storage.put(key, data);
        variants.push({ format, width: info.width, height: info.height, key, bytes: info.size });
      }
    }

    const fallbackWidth = Math.min(width, FALLBACK_MAX_WIDTH);
    const fallbackFormat = hasAlpha ? "png" : "jpeg";
    const fallback = base().resize({ width: fallbackWidth, withoutEnlargement: true });
    const { data, info } = await (hasAlpha
      ? fallback.png({ compressionLevel: 9, palette: true })
      : fallback.jpeg({ quality: options.quality.fallback, mozjpeg: true })
    ).toBuffer({ resolveWithObject: true });
    const key = `${id}/${fallbackWidth}.${fallbackFormat === "jpeg" ? "jpg" : "png"}`;
    await storage.put(key, data);
    variants.push({ format: fallbackFormat, width: info.width, height: info.height, key, bytes: info.size });

    const [record] = await getDb()
      .insert(mediaFiles)
      .values({
        id,
        filename: file.name.slice(0, 200) || "image",
        width,
        height,
        bytes: file.size,
        color: hex(dominant),
        variants,
        uploadedBy: userId,
      })
      .returning();
    return record!;
  } catch (error) {
    await storage.remove(id);
    throw error;
  }
}

export async function deleteMedia(id: string) {
  await getDb().delete(mediaFiles).where(eq(mediaFiles.id, id));
  await storage.remove(id);
}
