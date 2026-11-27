"use client";

import Image from "next/image";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { Skeleton } from "../ui/Skeleton";
import type { Zoom } from "./stage-zoom";
import { useStageZoomSurface } from "./use-stage-zoom";

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
 * At Fit, as wide as the stage up to its own width (never upscaled); zoomed, its width in
 * surface px times the zoom, however wide that is (the stage scrolls both ways).
 */
function surfaceStyle(zoom: Zoom, width: number | undefined): CSSProperties | undefined {
  if (!width) return undefined;
  return zoom === "fit" ? { maxWidth: width } : { width: width * zoom };
}

/**
 * An image surface with the pins layer over it, drawn at the stage's zoom (`StageZoomContext`):
 * at Fit, its natural width (never upscaled). Pins are percentages of the image, so they scroll
 * and zoom with it.
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
  /** Its width in surface px: a snapshot's page width, or the image's own. */
  const width = size?.width ?? (ready ? loaded.width : undefined);
  const { zoom, attach } = useStageZoomSurface();
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomed = zoom !== "fit" && Boolean(width);

  useLayoutEffect(() => {
    const node = canvasRef.current;
    if (!node || !width) return;
    return attach(node, width);
  }, [attach, width]);

  return (
    <div
      ref={canvasRef}
      data-testid="canvas"
      className={`relative mx-auto ${zoomed ? "max-w-none" : "w-full"}`}
      style={surfaceStyle(zoom, width)}
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
