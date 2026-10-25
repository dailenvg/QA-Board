"use client";

import { AnimatePresence, Reorder } from "motion/react";
import { useId, useRef, useState } from "react";
import { PickedImageRow } from "./PickedImageRow";
import type { PickedImage } from "./use-picked-images";

interface PickedImageListProps {
  items: readonly PickedImage[];
  orderable: boolean;
  onMove: (from: number, to: number) => void;
  onReorder: (keys: string[]) => void;
  onRemove: (key: string) => void;
  /** The last file was removed: the list is about to go, so focus needs somewhere to land. */
  onEmptied: () => void;
}

/**
 * The chosen images, in page order while combining, with an announcement for
 * each keyboard move and removal. Removing a file moves focus to the next
 * file's Remove (or the previous one's), so it never drops to the page.
 */
export function PickedImageList({
  items,
  orderable,
  onMove,
  onReorder,
  onRemove,
  onEmptied,
}: PickedImageListProps) {
  const hintId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const move = (from: number, to: number) => {
    const item = items[from];
    onMove(from, to);
    if (item) setAnnouncement(`${item.fileName} moved to page ${to + 1} of ${items.length}.`);
  };

  const remove = (key: string) => {
    const index = items.findIndex((item) => item.key === key);
    const removed = items[index];
    const neighbour = items[index + 1] ?? items[index - 1];
    onRemove(key);
    if (removed) setAnnouncement(`${removed.fileName} removed.`);
    if (!neighbour) {
      onEmptied();
      return;
    }
    // The neighbour's button is already there; the removed row is still fading out.
    root.current
      ?.querySelector<HTMLElement>(`[data-remove-key="${CSS.escape(neighbour.key)}"]`)
      ?.focus();
  };

  return (
    <div ref={root}>
      {orderable ? (
        <p id={hintId} className="mb-2 text-meta text-muted">
          Drag the handles, or focus one and press the up and down arrow keys, to set the page
          order.
        </p>
      ) : null}
      <Reorder.Group
        as="ol"
        axis="y"
        values={items.map((item) => item.key)}
        onReorder={onReorder}
        aria-label={orderable ? "Pages, in order" : "Chosen images"}
        data-testid="picked-images"
        className="flex max-h-72 flex-col gap-2 overflow-y-auto p-1"
      >
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <PickedImageRow
              key={item.key}
              item={item}
              index={index}
              total={items.length}
              orderable={orderable}
              hintId={hintId}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
