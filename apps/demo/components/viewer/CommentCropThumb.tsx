"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useId, useState } from "react";
import { useBlobUrl } from "@/lib/blob-store/use-blob-url";
import { press } from "@/lib/motion";
import type { CommentCrop } from "@/lib/store/types";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";
import { cropFrame } from "./crop-window";

interface CommentCropThumbProps {
  crop: CommentCrop;
  /** The pin in surface px, like `crop.rect`; null when unknown. */
  pin: { x: number; y: number } | null;
  number: number;
}

/**
 * What the commenter saw, as a thumbnail that opens larger: the part of the
 * crop around the pin (`cropFrame`); the dialog shows all of it. Hidden if
 * the picture is gone.
 */
export function CommentCropThumb({ crop, pin, number }: CommentCropThumbProps) {
  const image = useBlobUrl(crop.blobKey);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const loadingId = useId();
  if (image.status === "missing") return null;
  const ready = image.status === "ready";
  const frame = cropFrame(crop.rect, pin);

  return (
    // `relative` lifts the thumbnail above the select button's card-wide ::after.
    <div className="relative px-4 pb-2">
      <motion.button
        type="button"
        data-testid="comment-crop"
        disabled={!ready}
        aria-label={`Open the screenshot for comment ${number}`}
        aria-describedby={ready ? undefined : loadingId}
        aria-busy={ready ? undefined : true}
        onClick={() => setOpen(true)}
        {...(reduce || !ready ? {} : press)}
        // 3:2 so the pin's window fills the box; capped at 320px so the full-width sheet on
        // tablets doesn't turn it into a ~470px-tall picture. The panel and phones sit under it.
        className="relative block aspect-3/2 w-full max-w-80 overflow-hidden rounded-tile bg-tile ring-1 ring-line transition-shadow hover:ring-line-strong active:ring-line-strong disabled:cursor-wait"
      >
        {ready ? (
          <>
            {/* The whole crop, placed so the box frames the window around the pin. */}
            <span
              data-testid="comment-crop-frame"
              className="absolute"
              style={{
                left: `${frame.left}%`,
                top: `${frame.top}%`,
                width: `${frame.width}%`,
                height: `${frame.height}%`,
              }}
            >
              <Image
                src={image.url}
                alt=""
                fill
                unoptimized
                sizes="22rem"
                className="object-fill"
              />
            </span>
            {/* Always shown, so touch users (no hover) can tell the thumbnail opens larger. */}
            <span
              aria-hidden="true"
              className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-pill bg-inv text-on-inv shadow-seg"
            >
              <Icon name="maximize" className="size-4" />
            </span>
          </>
        ) : (
          <>
            <Skeleton className="absolute inset-0 rounded-none" />
            {/* A description, not a live region: a list of cards loading shouldn't chatter. */}
            <span id={loadingId} className="sr-only">
              Loading the screenshot…
            </span>
          </>
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
            alt={`The area around pin ${number}`}
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
