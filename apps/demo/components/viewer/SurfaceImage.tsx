"use client";

import Image from "next/image";
import { useState, type ReactNode, type Ref } from "react";
import { Skeleton } from "../ui/Skeleton";

interface SurfaceImageProps {
  src: string;
  alt: string;
  /** Known up front for snapshots, so the page doesn't jump when the image arrives. */
  size?: { width: number; height: number };
  overlay: ReactNode;
  imageRef?: Ref<HTMLImageElement>;
  onReady?: () => void;
  onError: () => void;
}

/**
 * An image surface at its natural width (never upscaled) with the pins layer
 * over it. Pins are percentages of the image, so they scroll with it.
 */
export function SurfaceImage({
  src,
  alt,
  size,
  overlay,
  imageRef,
  onReady,
  onError,
}: SurfaceImageProps) {
  const [loaded, setLoaded] = useState<{ src: string; width: number } | null>(null);
  const ready = loaded?.src === src;
  const maxWidth = size?.width ?? (ready ? loaded.width : undefined);

  return (
    <div
      data-testid="canvas"
      className="relative mx-auto w-full"
      style={maxWidth ? { maxWidth } : undefined}
    >
      {ready ? null : <Skeleton className="absolute inset-0 min-h-80" />}
      <Image
        ref={imageRef}
        src={src}
        alt={alt}
        width={size?.width ?? 0}
        height={size?.height ?? 0}
        sizes="100vw"
        unoptimized
        draggable={false}
        onLoad={(event) => {
          setLoaded({ src, width: event.currentTarget.naturalWidth });
          onReady?.();
        }}
        onError={onError}
        className="block h-auto w-full rounded-tile bg-card shadow-float select-none"
      />
      {ready ? overlay : null}
    </div>
  );
}
