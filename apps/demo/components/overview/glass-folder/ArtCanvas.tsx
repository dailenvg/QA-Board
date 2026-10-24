"use client";

import { useEffect, useRef, useState } from "react";
import type { ArtRecipe } from "./art";
import { paint, paintSize } from "./painter";

interface ArtCanvasProps {
  recipe: ArtRecipe;
  seed: number;
  /** Size in the folder's own units (CSS px before the stage scale). */
  width: number;
  height: number;
  /** Device pixels per unit: the stage scale times the screen's pixel ratio. */
  density: number;
  className?: string;
}

/**
 * A painted artwork. It blurs in the first time it is ready; later repaints
 * (a new size step) swap in without fading, keeping the old bitmap meanwhile.
 */
export function ArtCanvas({ recipe, seed, width, height, density, className }: ArtCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const size = paintSize(width, height, density);

  useEffect(() => {
    let live = true;
    void paint(recipe, seed, size.width, size.height).then((source) => {
      const node = canvas.current;
      if (!live || !node) return;
      node.width = source.width;
      node.height = source.height;
      node.getContext("2d")?.drawImage(source, 0, 0);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [recipe, seed, size.width, size.height]);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={className}
      data-ready={ready || undefined}
      style={{ width, height, maxWidth: "none" }}
    />
  );
}
