"use client";

import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import Image from "next/image";
import type { KeyboardEvent } from "react";
import { fadeOnly, instant, spring } from "@/lib/motion";
import { useObjectUrl } from "@/lib/use-object-url";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";
import type { PickedImage } from "./use-picked-images";

interface PickedImageRowProps {
  item: PickedImage;
  index: number;
  total: number;
  /** Combining into one project: the row shows its page number and can be reordered. */
  orderable: boolean;
  /** Id of the text that explains how to reorder. */
  hintId: string;
  onMove: (from: number, to: number) => void;
  onRemove: (key: string) => void;
}

function Thumbnail({ item }: { item: PickedImage }) {
  if (item.status === "preparing") return <Skeleton className="size-full" />;
  if (item.status === "failed") {
    return (
      <span className="grid size-full place-items-center bg-danger-soft text-danger">
        <Icon name="alert" className="size-5" />
      </span>
    );
  }
  return <Preview blob={item.image.blob} />;
}

function Preview({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return url ? (
    <Image src={url} alt="" fill unoptimized className="object-cover" />
  ) : (
    <Skeleton className="size-full" />
  );
}

function statusText(item: PickedImage, index: number, orderable: boolean): string {
  if (item.status === "preparing") return "Preparing…";
  if (item.status === "failed") return item.error;
  return orderable ? `Page ${index + 1}` : `${item.image.width} × ${item.image.height} px`;
}

/**
 * One chosen image: its preview, its page number or progress or error, and
 * Remove. While combining, its handle reorders it by drag, or with the up and
 * down arrow keys.
 */
export function PickedImageRow({
  item,
  index,
  total,
  orderable,
  hintId,
  onMove,
  onRemove,
}: PickedImageRowProps) {
  const controls = useDragControls();
  const reduce = useReducedMotion();

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const to = index + step;
    if (to >= 0 && to < total) onMove(index, to);
  };

  return (
    <Reorder.Item
      value={item.key}
      dragListener={false}
      dragControls={controls}
      variants={fadeOnly}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={reduce ? instant : spring.snappy}
      data-testid="picked-image"
      data-status={item.status}
      className="relative flex items-center gap-3 rounded-tile bg-card p-2 ring-1 ring-line ring-inset"
    >
      {orderable ? (
        <button
          type="button"
          aria-label={`Reorder ${item.fileName}, page ${index + 1} of ${total}`}
          aria-describedby={hintId}
          onPointerDown={(event) => controls.start(event)}
          onKeyDown={onHandleKey}
          data-testid="reorder-handle"
          className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-pill text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing active:bg-hover"
        >
          <Icon name="grip" className="size-5" />
        </button>
      ) : null}
      <span className="relative size-12 shrink-0 overflow-hidden rounded-row bg-tile">
        <Thumbnail item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold">{item.fileName}</span>
        <span
          className={`block text-meta ${item.status === "failed" ? "text-danger" : "text-muted"}`}
        >
          {statusText(item, index, orderable)}
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(item.key)}
        aria-label={`Remove ${item.fileName}`}
        data-remove-key={item.key}
        className="text-muted hover:text-danger"
      >
        <Icon name="close" className="size-4" />
      </Button>
    </Reorder.Item>
  );
}
