/**
 * Image picker for admin forms (React island). Stores the chosen media id in a
 * hidden input, so it submits with a normal <form> — no extra wiring needed.
 * Use through <MediaField>, which renders it with `client:visible`.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { buttonClasses, inputClasses } from "@/components/ui/variants";
import type { PublicMedia } from "../lib/urls";

export interface MediaPickerLabels {
  choose: string;
  change: string;
  remove: string;
  select: string;
  close: string;
  search: string;
  upload: string;
  uploading: string;
  loadMore: string;
  empty: string;
  missingAlt: string;
}

interface Props {
  name: string;
  initial: PublicMedia | null;
  labels: MediaPickerLabels;
  required?: boolean;
}

interface ListResponse {
  items: PublicMedia[];
  total: number;
  page: number;
  pageSize: number;
}

export default function MediaPicker({ name, initial, labels, required = false }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<PublicMedia | null>(initial);
  const [items, setItems] = useState<PublicMedia[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (nextPage: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), q: search });
      const response = await fetch(`/api/admin/media?${params}`, { headers: { Accept: "application/json" } });
      // Expired session etc.: reload so the middleware sends the user to sign in.
      if (response.status === 401) return location.reload();
      if (!response.ok) return;
      const data = (await response.json()) as ListResponse;
      setItems((current) => (nextPage === 1 ? data.items : [...current, ...data.items]));
      setPage(nextPage);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search while the dialog is open.
  useEffect(() => {
    if (!dialogRef.current?.open) return;
    const timer = setTimeout(() => void load(1, query), 250);
    return () => clearTimeout(timer);
  }, [query, load]);

  const open = () => {
    dialogRef.current?.showModal();
    void load(1, query);
  };

  const choose = (media: PublicMedia) => {
    setSelected(media);
    dialogRef.current?.close();
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      const response = await fetch("/api/admin/media", { method: "POST", body, headers: { Accept: "application/json" } });
      if (response.status === 401) return location.reload();
      const data = (await response.json().catch(() => ({ items: [] }))) as { items: PublicMedia[] };
      if (data.items.length === 1) choose(data.items[0]!);
      else await load(1, "");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div>
      <input type="hidden" name={name} value={selected?.id ?? ""} required={required} />

      {selected ? (
        <div className="flex items-center gap-4">
          <img
            src={selected.thumbnail}
            alt={selected.alt}
            width={96}
            height={96}
            className="size-24 rounded-md border border-border object-cover"
            style={{ backgroundColor: selected.color }}
          />
          <div className="min-w-0 space-y-2">
            <p className="truncate text-sm font-medium">{selected.filename}</p>
            <div className="flex gap-2">
              <button type="button" className={buttonClasses("outline", "sm")} onClick={open}>
                {labels.change}
              </button>
              <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setSelected(null)}>
                {labels.remove}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className={buttonClasses("outline")} onClick={open}>
          {labels.choose}
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-0 text-card-foreground backdrop:bg-black/50"
        onClick={(event) => event.target === dialogRef.current && dialogRef.current.close()}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <input
            type="search"
            value={query}
            placeholder={labels.search}
            aria-label={labels.search}
            onChange={(event) => setQuery(event.target.value)}
            className={`${inputClasses} max-w-xs py-2`}
          />
          <label className={buttonClasses("secondary", "sm", "cursor-pointer")}>
            {uploading ? labels.uploading : labels.upload}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={upload} disabled={uploading} />
          </label>
          <button type="button" className={buttonClasses("ghost", "sm", "ml-auto")} onClick={() => dialogRef.current?.close()}>
            {labels.close}
          </button>
        </div>

        <div className="max-h-[65dvh] overflow-y-auto p-4">
          {items.length === 0 && !loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {items.map((media) => (
                <li key={media.id}>
                  <button
                    type="button"
                    onClick={() => choose(media)}
                    aria-label={`${labels.select}: ${media.filename}`}
                    aria-pressed={selected?.id === media.id}
                    className="group block w-full overflow-hidden rounded-lg border border-border text-left aria-pressed:ring-2 aria-pressed:ring-primary"
                  >
                    <img
                      src={media.thumbnail}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full object-cover transition group-hover:scale-105"
                      style={{ backgroundColor: media.color }}
                    />
                    <span className="block truncate px-2 py-1 text-xs">
                      {media.filename}
                      {!media.alt && <span className="text-destructive"> · {labels.missingAlt}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length < total && (
            <div className="mt-4 text-center">
              <button type="button" className={buttonClasses("outline", "sm")} disabled={loading} onClick={() => void load(page + 1, query)}>
                {labels.loadMore}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
