/** `modules.config.ts` → `options: { media: { … } }` */
export interface MediaOptions {
  /** Largest accepted upload in megabytes. */
  maxUploadMb: number;
  /** Responsive widths generated (never upscaled beyond the original). */
  widths: number[];
  /** Encoder qualities, 1–100. */
  quality: { avif: number; webp: number; fallback: number };
  /** libvips threads used while processing an upload (keep low on small nodes). */
  threads: number;
}

export const mediaDefaults: MediaOptions = {
  maxUploadMb: 15,
  widths: [320, 640, 960, 1280, 1920],
  quality: { avif: 50, webp: 75, fallback: 80 },
  threads: 2,
};

declare module "@/modules/types" {
  interface ModuleOptionsMap {
    media: MediaOptions;
  }
}
