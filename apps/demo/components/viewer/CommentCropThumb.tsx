"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import { useBlobUrl } from "@/lib/blob-store/use-blob-url";
import { press } from "@/lib/motion";
import type { CommentCrop } from "@/lib/store/types";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";

interface CommentCropThumbProps {
  crop: CommentCrop;
  number: number;
}

/** What the commenter saw, as a thumbnail that opens larger. Hidden if the picture is gone. */
export function CommentCropThumb({ crop, number }: CommentCropThumbProps) {
  const image = useBlobUrl(crop.blobKey);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (image.status === "missing") return null;
  const ready = image.status === "ready";

  return (
    // `relative` lifts the thumbnail above the select button's card-wide ::after.
    <div className="relative px-4 pb-2">
      <motion.button
        type="button"
        data-testid="comment-crop"
        disabled={!ready}
        aria-label={`Open the screenshot for comment ${number}`}
        onClick={() => setOpen(true)}
        {...(reduce || !ready ? {} : press)}
        className="relative block h-32 w-full overflow-hidden rounded-tile bg-tile ring-1 ring-line transition-shadow hover:ring-line-strong active:ring-line-strong disabled:cursor-wait"
      >
        {ready ? (
          <>
            <Image
              src={image.url}
              alt=""
              fill
              unoptimized
              sizes="22rem"
              className="object-contain"
            />
            {/* Always shown, so touch users (no hover) can tell the thumbnail opens larger. */}
            <span
              aria-hidden="true"
              className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-pill bg-inv text-on-inv shadow-seg"
            >
              <Icon name="maximize" className="size-4" />
            </span>
          </>
        ) : (
          <Skeleton className="absolute inset-0 rounded-none" />
        )}
      </motion.button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Screenshot for comment ${number}`}
        description="What was on screen when the comment was posted, with its pin marked."
        size="lg"
        testId="crop-dialog"
      >
        {ready ? (
          <Image
            src={image.url}
            alt={`The page around pin ${number}`}
            width={crop.rect.width}
            height={crop.rect.height}
            unoptimized
            className="h-auto w-full rounded-tile bg-tile"
          />
        ) : null}
      </Dialog>
    </div>
  );
}
