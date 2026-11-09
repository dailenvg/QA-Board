"use client";

import { useId, type CSSProperties } from "react";
import {
  scaleAtStep,
  stepAtScale,
  stopAtFill,
  zoomLabel,
  ZOOM_STEPS,
  type ZoomRange,
} from "@/lib/account/image-framing";
import type { ImageKind } from "@/lib/account/image-rules";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface ImageCropZoomProps {
  kind: ImageKind;
  range: ZoomRange;
  scale: number;
  onZoom: (scale: number) => void;
  onReset: () => void;
  /** False while the framing is where it started: Reset has nothing to do. */
  canReset: boolean;
}

/** How many slider steps the − and + buttons move. */
const BUTTON_STEPS = 10;

/** Where the slider's thumb centre sits at `step`: its 20px thumb stays inside the track. */
function thumbLeft(step: number): string {
  return `calc(0.625rem + ${step / ZOOM_STEPS} * (100% - 1.25rem))`;
}

/**
 * The crop step's size: a slider (with Fit and Fill marked for a logo),
 * − and + either side, and Reset. Its value reads as Fit, Fill or a share of
 * Fill. With nothing to zoom (a source too small to zoom past Fill), all but
 * Reset are disabled.
 */
export function ImageCropZoom({
  kind,
  range,
  scale,
  onZoom,
  onReset,
  canReset,
}: ImageCropZoomProps) {
  const id = useId();
  const step = stepAtScale(range, scale);
  const fixed = range.max <= range.min;
  const label = zoomLabel(kind, range, scale);
  const atMin = fixed || scale <= range.min;
  const atMax = fixed || scale >= range.max;

  const nudge = (direction: 1 | -1) => {
    if (direction < 0 ? atMin : atMax) return;
    const next = Math.min(ZOOM_STEPS, Math.max(0, step + direction * BUTTON_STEPS));
    onZoom(stopAtFill(range, scale, scaleAtStep(range, next)));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="flex items-baseline gap-2 text-body font-semibold">
          Size
          <span aria-hidden="true" className="font-normal text-muted tabular-nums">
            {label}
          </span>
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (canReset) onReset();
          }}
          aria-disabled={!canReset || undefined}
          data-testid="image-crop-reset"
        >
          <Icon name="undo" className="size-4" />
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Smaller"
          onClick={() => nudge(-1)}
          aria-disabled={atMin || undefined}
          data-testid="image-crop-smaller"
        >
          <Icon name="minus" />
        </Button>
        <input
          id={id}
          type="range"
          min={0}
          max={ZOOM_STEPS}
          step={1}
          value={step}
          disabled={fixed}
          aria-valuetext={label}
          onChange={(event) => onZoom(scaleAtStep(range, Number(event.target.value)))}
          className="range-input block min-w-0 flex-1"
          style={{ "--range-progress": `${step}%` } as CSSProperties}
          data-autofocus={fixed ? undefined : true}
          data-testid="image-crop-zoom"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Larger"
          onClick={() => nudge(1)}
          aria-disabled={atMax || undefined}
          data-testid="image-crop-larger"
        >
          <Icon name="plus" />
        </Button>
      </div>
      {/* Under the track, between the buttons; the value says the same, for screen readers. */}
      {kind === "logo" && !fixed ? (
        <div aria-hidden="true" className="relative mx-13 -mt-2 h-4 text-label text-muted">
          <span className="absolute -translate-x-1/2" style={{ left: thumbLeft(0) }}>
            Fit
          </span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: thumbLeft(stepAtScale(range, range.fill)) }}
          >
            Fill
          </span>
        </div>
      ) : null}
    </div>
  );
}
