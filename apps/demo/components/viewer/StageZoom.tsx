"use client";

import type { ReactNode, RefObject } from "react";
import { StageZoomContext, useStageZoom } from "./use-stage-zoom";
import { ZoomControl } from "./ZoomControl";

interface StageZoomProps {
  /** The stage's scrolling `main`, which zooming and Space-drag scroll. */
  scroller: RefObject<HTMLElement | null>;
  /** The stage shows an image, a PDF page or a snapshot: not a live website's frame. */
  zoomable: boolean;
  /** The stage. */
  children: ReactNode;
}

/**
 * The stage with its zoom (`useStageZoom`): surfaces in it draw at the zoom, and the zoom
 * control floats over its bottom right corner. Zooming re-renders the surface and the control,
 * not the viewer around them. While Space is held over a surface that overflows, the hand
 * shows over the stage.
 */
export function StageZoom({ scroller, zoomable, children }: StageZoomProps) {
  const stage = useStageZoom(scroller);
  return (
    <StageZoomContext value={stage.surface}>
      <div
        data-pan={stage.pan}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col data-[pan=armed]:**:cursor-grab! data-[pan=dragging]:select-none data-[pan=dragging]:**:cursor-grabbing!"
      >
        {children}
        <ZoomControl
          shown={zoomable}
          zoom={stage.zoom}
          effective={stage.effective}
          onZoomIn={stage.zoomIn}
          onZoomOut={stage.zoomOut}
          onZoomTo={stage.zoomTo}
        />
      </div>
    </StageZoomContext>
  );
}
