import type { Locale } from "@site-config";
import { translateModule } from "@/modules/registry";
import type { EditorLabels } from "../components/MarkdownEditor";
import type { MediaPickerLabels } from "../components/MediaPicker";

const KEYS: (keyof MediaPickerLabels)[] = [
  "choose", "change", "remove", "select", "close", "search", "upload", "uploading", "loadMore", "empty", "missingAlt",
];

/** Translated labels for the media picker/library islands. */
export const mediaLabels = (lang: Locale) =>
  Object.fromEntries(KEYS.map((key) => [key, translateModule(lang, "media", key)])) as unknown as MediaPickerLabels;

const EDITOR_KEYS: (keyof EditorLabels)[] = [
  "write", "preview", "bold", "italic", "heading", "link", "list", "quote", "image", "linkPrompt", "loading", "hint",
];

/** Translated labels for the Markdown editor island. */
export const editorLabels = (lang: Locale) =>
  Object.fromEntries(EDITOR_KEYS.map((key) => [key, translateModule(lang, "media", `editor.${key}`)])) as unknown as EditorLabels;
