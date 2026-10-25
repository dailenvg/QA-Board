"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { useRevealVariants } from "@/lib/motion";
import { CombineChoice, type ImageGrouping } from "./CombineChoice";
import { ImageDropzone } from "./ImageDropzone";
import { PickedImageList } from "./PickedImageList";
import type { PickedImage, usePickedImages } from "./use-picked-images";

const images = (count: number) => (count === 1 ? "1 image" : `${count} images`);

/** Where the chosen files are, for screen readers: rows change status silently. */
function preparationSummary(items: readonly PickedImage[]): string {
  if (!items.length) return "";
  const preparing = items.filter((item) => item.status === "preparing").length;
  if (preparing) return `Preparing ${images(preparing)}…`;
  const failed = items.filter((item) => item.status === "failed").length;
  const ready = `${images(items.length - failed)} ready.`;
  return failed ? `${ready} ${images(failed)} couldn't be prepared.` : ready;
}

interface ImagesFieldProps {
  picked: ReturnType<typeof usePickedImages>;
  grouping: ImageGrouping;
  onGrouping: (grouping: ImageGrouping) => void;
  error: string | null;
  /** The form's error is out of date once the files change. */
  onChange: () => void;
}

/** Image mode: the dropzone, how several images are grouped, and the chosen files. */
export function ImagesField({ picked, grouping, onGrouping, error, onChange }: ImagesFieldProps) {
  const reveal = useRevealVariants();
  const root = useRef<HTMLDivElement>(null);
  const several = picked.items.length > 1;
  return (
    <div ref={root} className="flex flex-col gap-4">
      <ImageDropzone
        hasImages={picked.items.length > 0}
        error={error ?? picked.notice}
        onFiles={(files) => {
          onChange();
          picked.add(files);
        }}
      />
      <AnimatePresence initial={false}>
        {several ? (
          <motion.div
            key="grouping"
            variants={reveal}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <CombineChoice value={grouping} onChange={onGrouping} />
          </motion.div>
        ) : null}
      </AnimatePresence>
      {picked.items.length ? (
        <PickedImageList
          items={picked.items}
          orderable={several && grouping === "combine"}
          onMove={picked.move}
          onReorder={picked.reorder}
          onRemove={(key) => {
            onChange();
            picked.remove(key);
          }}
          // The last file is gone: keyboard focus goes back to the file picker.
          onEmptied={() => root.current?.querySelector<HTMLElement>('input[type="file"]')?.focus()}
        />
      ) : null}
      {/* aria-live, not role="status": the list's own status announces reordering. */}
      <p aria-live="polite" className="sr-only">
        {preparationSummary(picked.items)}
      </p>
    </div>
  );
}
