"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useState } from "react";
import { canPan, type Framing, type SourceSize, type ZoomRange } from "@/lib/account/image-framing";
import type { ImageKind } from "@/lib/account/image-rules";
import { duration, instant, spring } from "@/lib/motion";
import { Skeleton } from "../ui/Skeleton";
import { useCropGestures, type FramingChange } from "./use-crop-gestures";

interface ImageCropFrameProps {
  kind: ImageKind;
  /** The picked file's object URL; null for the frame while it's made. */
  src: string | null;
  size: SourceSize;
  range: ZoomRange;
  framing: Framing;
  /** Glide to `framing` (after Reset) rather than jump there, as a drag or zoom must. */
  settling: boolean;
  onChange: FramingChange;
  /** The visible hint saying how to move the image. */
  describedBy: string;
}

/**
 * A logo on its white backing, its corners in the settings tile's proportion
 * (16px on 96px: a sixth of the side), so the preview rounds like the tile it
 * lands in rather than like a flat 16px on a much larger square; a photo
 * square, as it's stored, with what the round avatar keeps cut out of a
 * dimmed surround.
 */
const SHAPES: Record<ImageKind, string> = {
  logo: "rounded-[16.667%] bg-logo-bg",
  avatar: "rounded-tile bg-tile",
};

/**
 * The frame's side: 288px where there's room, smaller on short screens so
 * the whole dialog (Save included) fits without scrolling down to 375×667,
 * never under 160px. The subtracted heights are the dialog's other content,
 * stacked on phones and in a row of buttons from `sm`.
 */
const FRAME_SIDE =
  "max-w-[clamp(10rem,calc(100dvh_-_27rem),18rem)] sm:max-w-[clamp(10rem,calc(100dvh_-_23rem),18rem)]";

/**
 * The circle a photo keeps: a white rim with a dark band inside it (the pins'
 * halo and band), so its edge reads on light and dark photos alike, over a
 * dimmed surround. Inset, so the frame's edges don't clip it where they meet.
 */
const AVATAR_CUTOUT =
  "shadow-[inset_0_0_0_2px_var(--color-pin-halo),inset_0_0_0_3px_var(--color-pin-band),0_0_0_100vmax_var(--color-scrim)]";

/**
 * The crop step's preview: the picked image at its framing, in a square that
 * looks like where it's shown. It follows a drag or zoom exactly, frame by
 * frame; only Reset springs (jumps with reduced motion). Drag, pinch, wheel
 * and arrow keys move it (`useCropGestures`).
 */
export function ImageCropFrame({
  kind,
  src,
  size,
  range,
  framing,
  settling,
  onChange,
  describedBy,
}: ImageCropFrameProps) {
  const reduce = useReducedMotion();
  const { ref, handlers } = useCropGestures({ size, range, onChange });
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const shorter = Math.min(size.width, size.height);
  const movable = canPan(size, framing);
  const move = settling && !reduce ? spring.ui : instant;
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Position"
      aria-describedby={describedBy}
      tabIndex={0}
      data-testid="image-crop-frame"
      className={`relative aspect-square w-full ${FRAME_SIDE} touch-none overflow-hidden shadow-seg ring-1 ring-line select-none ${SHAPES[kind]} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
      {...handlers}
    >
      {loaded || broken ? null : <Skeleton className="absolute inset-0 size-full rounded-none" />}
      {broken ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-meta text-muted">
          The preview couldn&apos;t be shown. You can still save it.
        </p>
      ) : null}
      {src && !broken ? (
        // The frame's size at Fill, scaled from its centre and moved in frame sides.
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{
            x: `${framing.x * 100}%`,
            y: `${framing.y * 100}%`,
            scale: framing.scale / range.fill,
            opacity: loaded ? 1 : 0,
          }}
          transition={{ x: move, y: move, scale: move, opacity: { duration: duration.micro } }}
        >
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: `${(size.width / shorter) * 100}%`,
              height: `${(size.height / shorter) * 100}%`,
            }}
          >
            <Image
              src={src}
              alt=""
              fill
              unoptimized
              draggable={false}
              onLoad={() => setLoaded(true)}
              onError={() => setBroken(true)}
            />
          </span>
        </motion.div>
      ) : null}
      {kind === "avatar" ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-pill ${AVATAR_CUTOUT}`}
        />
      ) : null}
    </div>
  );
}
