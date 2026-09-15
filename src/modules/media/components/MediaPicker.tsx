/**
 * Image picker for admin forms (React island). Stores the chosen media id in a
 * hidden input, so it submits with a normal <form> — no extra wiring needed.
 * Use through <MediaField>, which renders it with `client:visible`.
 */
import { useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/variants";
import type { PublicMedia } from "../lib/urls";
import { MediaLibraryDialog, type MediaLibraryHandle, type MediaLibraryLabels } from "./MediaLibraryDialog";

export interface MediaPickerLabels extends MediaLibraryLabels {
  choose: string;
  change: string;
  remove: string;
}

interface Props {
  name: string;
  initial: PublicMedia | null;
  labels: MediaPickerLabels;
  required?: boolean;
}

export default function MediaPicker({ name, initial, labels, required = false }: Props) {
  const library = useRef<MediaLibraryHandle>(null);
  const [selected, setSelected] = useState<PublicMedia | null>(initial);

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
              <button type="button" className={buttonClasses("outline", "sm")} onClick={() => library.current?.open()}>
                {labels.change}
              </button>
              <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setSelected(null)}>
                {labels.remove}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className={buttonClasses("outline")} onClick={() => library.current?.open()}>
          {labels.choose}
        </button>
      )}

      <MediaLibraryDialog ref={library} labels={labels} selectedId={selected?.id ?? null} onPick={setSelected} />
    </div>
  );
}
