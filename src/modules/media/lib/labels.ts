import type { Locale } from "@site-config";
import { translateModule } from "@/modules/registry";
import type { MediaPickerLabels } from "../components/MediaPicker";

const KEYS: (keyof MediaPickerLabels)[] = [
  "choose", "change", "remove", "select", "close", "search", "upload", "uploading", "loadMore", "empty", "missingAlt",
];

/** Translated labels for the media picker/library islands. */
export const mediaLabels = (lang: Locale) =>
  Object.fromEntries(KEYS.map((key) => [key, translateModule(lang, "media", key)])) as unknown as MediaPickerLabels;
