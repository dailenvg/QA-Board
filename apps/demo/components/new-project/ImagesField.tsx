"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { CombineChoice, type ImageGrouping } from "./CombineChoice";
import { ImageDropzone } from "./ImageDropzone";
import { PickedImageList } from "./PickedImageList";
import type { usePickedImages } from "./use-picked-images";

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
  const several = picked.items.length > 1;
  return (
    <div className="flex flex-col gap-4">
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
        />
      ) : null}
    </div>
  );
}
