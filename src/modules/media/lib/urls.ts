/** URL/srcset helpers — pure functions, safe to use in any page or island. */
import type { MediaFile, MediaVariant } from "../db/schema";

export const mediaUrl = (key: string) => `/media/${key}`;

/** Smallest variant at least `minWidth` wide, for thumbnails and previews. */
export function pickVariant(media: MediaFile, minWidth: number, format: MediaVariant["format"] = "webp") {
  const candidates = media.variants.filter((v) => v.format === format).sort((a, b) => a.width - b.width);
  return candidates.find((v) => v.width >= minWidth) ?? candidates.at(-1) ?? media.variants[0]!;
}

/** `srcset` string for one format. */
export function srcset(media: MediaFile, format: MediaVariant["format"]) {
  return media.variants
    .filter((v) => v.format === format)
    .sort((a, b) => a.width - b.width)
    .map((v) => `${mediaUrl(v.key)} ${v.width}w`)
    .join(", ");
}

/** JSON shape used by the admin API and the picker island. */
export function toPublic(media: MediaFile) {
  return {
    id: media.id,
    filename: media.filename,
    alt: media.alt,
    width: media.width,
    height: media.height,
    color: media.color,
    thumbnail: mediaUrl(pickVariant(media, 320).key),
    createdAt: media.createdAt.toISOString(),
  };
}

export type PublicMedia = ReturnType<typeof toPublic>;
