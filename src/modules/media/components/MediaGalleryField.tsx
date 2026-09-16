/**
 * Ordered multi-image field (React island). Submits a comma-separated list of
 * media ids in one hidden input. Use through <MediaGalleryInput>.
 */
import { useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/variants";
import type { PublicMedia } from "../lib/urls";
import { MediaLibraryDialog, type MediaLibraryHandle, type MediaLibraryLabels } from "./MediaLibraryDialog";

export interface GalleryLabels extends MediaLibraryLabels {
  add: string;
  moveUp: string;
  moveDown: string;
  remove: string;
}

interface Props {
  name: string;
  initial: PublicMedia[];
  labels: GalleryLabels;
}

export default function MediaGalleryField({ name, initial, labels }: Props) {
  const library = useRef<MediaLibraryHandle>(null);
  const [items, setItems] = useState(initial);

  const move = (index: number, delta: number) =>
    setItems((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={items.map((item) => item.id).join(",")} />
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item, index) => (
            <li key={item.id} className="group relative overflow-hidden rounded-md border border-border">
              <img src={item.thumbnail} alt={item.alt} className="aspect-square w-full object-cover" style={{ backgroundColor: item.color }} />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1 text-white">
                <button type="button" aria-label={labels.moveUp} disabled={index === 0} onClick={() => move(index, -1)} className="rounded px-1.5 text-xs disabled:opacity-30">
                  ←
                </button>
                <button type="button" aria-label={labels.remove} onClick={() => setItems(items.filter((i) => i.id !== item.id))} className="rounded px-1.5 text-xs">
                  ✕
                </button>
                <button type="button" aria-label={labels.moveDown} disabled={index === items.length - 1} onClick={() => move(index, 1)} className="rounded px-1.5 text-xs disabled:opacity-30">
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={buttonClasses("outline", "sm")} onClick={() => library.current?.open()}>
        + {labels.add}
      </button>
      <MediaLibraryDialog
        ref={library}
        labels={labels}
        onPick={(media) => setItems((current) => (current.some((i) => i.id === media.id) ? current : [...current, media]))}
      />
    </div>
  );
}
