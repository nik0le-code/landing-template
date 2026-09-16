/**
 * Markdown editor island: plain <textarea> (submits with the form, works with
 * spellcheck/autocorrect) plus a small toolbar, keyboard shortcuts, image insertion
 * from the media library and a server-rendered preview (the exact public HTML).
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { inputClasses } from "@/components/ui/variants";
import { MediaLibraryDialog, type MediaLibraryHandle, type MediaLibraryLabels } from "./MediaLibraryDialog";

export interface EditorLabels {
  write: string;
  preview: string;
  bold: string;
  italic: string;
  heading: string;
  link: string;
  list: string;
  quote: string;
  image: string;
  linkPrompt: string;
  loading: string;
  hint: string;
}

interface Props {
  name: string;
  initial: string;
  labels: EditorLabels;
  mediaLabels: MediaLibraryLabels;
}

export default function MarkdownEditor({ name, initial, labels, mediaLabels }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const library = useRef<MediaLibraryHandle>(null);
  const [value, setValue] = useState(initial);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);

  /** Wraps the selection (or inserts at the caret) and keeps focus. */
  const edit = (before: string, after = "", placeholder = "") => {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  /** Prefixes each selected line (headings, lists, quotes). */
  const prefixLines = (prefix: string) => {
    const el = textarea.current;
    if (!el) return;
    const lineStart = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const end = el.selectionEnd;
    const block = value.slice(lineStart, end).replace(/^/gm, prefix);
    setValue(value.slice(0, lineStart) + block + value.slice(end));
    requestAnimationFrame(() => el.focus());
  };

  const insertLink = () => {
    const url = window.prompt(labels.linkPrompt, "https://");
    if (url) edit("[", `](${url})`, labels.link);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "b") (event.preventDefault(), edit("**", "**", labels.bold));
    if (key === "i") (event.preventDefault(), edit("*", "*", labels.italic));
    if (key === "k") (event.preventDefault(), insertLink());
  };

  const showPreview = async () => {
    setTab("preview");
    setLoadingPreview(true);
    try {
      const response = await fetch("/api/admin/media/markdown-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ markdown: value }),
      });
      if (response.status === 401) return location.reload();
      const data = (await response.json()) as { html: string };
      setPreviewHtml(data.html);
    } finally {
      setLoadingPreview(false);
    }
  };

  const tools: { label: string; text: string; run: () => void }[] = [
    { label: labels.heading, text: "H2", run: () => prefixLines("## ") },
    { label: labels.bold, text: "B", run: () => edit("**", "**", labels.bold) },
    { label: labels.italic, text: "I", run: () => edit("*", "*", labels.italic) },
    { label: labels.link, text: "🔗", run: insertLink },
    { label: labels.list, text: "•", run: () => prefixLines("- ") },
    { label: labels.quote, text: "❝", run: () => prefixLines("> ") },
    { label: labels.image, text: "🖼", run: () => library.current?.open() },
  ];
  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 p-2">
        <div className="flex rounded-lg bg-muted p-0.5" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "write"} className={tabClass(tab === "write")} onClick={() => setTab("write")}>
            {labels.write}
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className={tabClass(tab === "preview")} onClick={showPreview}>
            {labels.preview}
          </button>
        </div>
        {tab === "write" && (
          <div className="flex flex-wrap gap-1">
            {tools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                onClick={tool.run}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold hover:bg-card"
              >
                {tool.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The textarea stays mounted (hidden in preview) so the form always submits the content. */}
      <textarea
        ref={textarea}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        rows={22}
        spellCheck
        hidden={tab !== "write"}
        className={`${inputClasses} rounded-none border-0 font-mono text-sm leading-relaxed focus:outline-none`}
      />
      {tab === "preview" && (
        <div className="min-h-96 p-6">
          {loadingPreview ? (
            <p className="text-sm text-muted-foreground">{labels.loading}</p>
          ) : (
            <div className="prose mx-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </div>
      )}
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{labels.hint}</p>

      <MediaLibraryDialog
        ref={library}
        labels={mediaLabels}
        onPick={(media) => edit(`\n\n![${media.alt || media.filename}](media:${media.id})\n\n`, "", "")}
      />
    </div>
  );
}
