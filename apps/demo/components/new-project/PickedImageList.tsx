"use client";

import { AnimatePresence, Reorder } from "motion/react";
import { useId, useState } from "react";
import { PickedImageRow } from "./PickedImageRow";
import type { PickedImage } from "./use-picked-images";

interface PickedImageListProps {
  items: readonly PickedImage[];
  orderable: boolean;
  onMove: (from: number, to: number) => void;
  onReorder: (keys: string[]) => void;
  onRemove: (key: string) => void;
}

/** The chosen images, in page order while combining, with an announcement for each keyboard move. */
export function PickedImageList({
  items,
  orderable,
  onMove,
  onReorder,
  onRemove,
}: PickedImageListProps) {
  const hintId = useId();
  const [announcement, setAnnouncement] = useState("");

  const move = (from: number, to: number) => {
    const item = items[from];
    onMove(from, to);
    if (item) setAnnouncement(`${item.fileName} moved to page ${to + 1} of ${items.length}.`);
  };

  return (
    <div>
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
        className="flex max-h-72 flex-col gap-2 overflow-y-auto p-0.5"
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
              onRemove={onRemove}
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
