import { useCallback, useRef, useState } from "react";
import { prepareImage } from "@/lib/image";
import type { ImageUpload } from "@/lib/store/actions";
import { newId } from "@/lib/store/id";
import { MAX_PAGES } from "@/lib/store/pages";

/** One chosen file and how its preparation (decode, downscale, re-encode) went. */
export type PickedImage = { key: string; fileName: string } & (
  | { status: "preparing" }
  | { status: "ready"; image: ImageUpload }
  | { status: "failed"; error: string }
);

/** Moves the entry at `from` to `to`, keeping the others in order. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

const tooMany = (left: number) =>
  `You can add up to ${MAX_PAGES} images at once. ${left === 1 ? "1 image was" : `${left} images were`} left out.`;

/**
 * The images chosen in the new-project form, in order. Files are prepared one
 * at a time (each decode holds a full-size canvas), and each shows its own
 * progress or error. At most `MAX_PAGES` are kept.
 */
export function usePickedImages() {
  const [items, setItems] = useState<PickedImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const count = useRef(0);

  const settle = useCallback((key: string, change: PickedImage) => {
    // A file removed while it was being prepared stays removed.
    setItems((current) => current.map((item) => (item.key === key ? change : item)));
  }, []);

  const add = useCallback(
    (files: readonly File[]) => {
      const room = Math.max(0, MAX_PAGES - count.current);
      const kept = files.slice(0, room);
      setNotice(files.length > kept.length ? tooMany(files.length - kept.length) : null);
      const added: PickedImage[] = kept.map((file) => ({
        key: newId(),
        fileName: file.name,
        status: "preparing",
      }));
      count.current += added.length;
      setItems((current) => [...current, ...added]);
      kept.forEach((file, index) => {
        const entry = added[index];
        if (!entry) return;
        queue.current = queue.current.then(async () => {
          const result = await prepareImage(file);
          const { key, fileName } = entry;
          if (!result.ok) {
            settle(key, { key, fileName, status: "failed", error: result.error });
            return;
          }
          const { dataUrl, width, height } = result;
          settle(key, {
            key,
            fileName,
            status: "ready",
            image: { dataUrl, fileName, width, height },
          });
        });
      });
    },
    [settle],
  );

  const remove = useCallback((key: string) => {
    count.current -= 1;
    setNotice(null);
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setItems((current) => moveItem(current, from, to));
  }, []);

  /** Puts the items in the order of `keys` (a drag's result); unknown keys are ignored. */
  const reorder = useCallback((keys: readonly string[]) => {
    setItems((current) => keys.flatMap((key) => current.find((item) => item.key === key) ?? []));
  }, []);

  return { items, notice, add, remove, move, reorder };
}
