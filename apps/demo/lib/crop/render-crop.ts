import { encodeWithinBudget, type CropStep } from "./crop-budget";
import type { CropPlan } from "./geometry";

/** Pin colors are fixed (not themed), as on the canvas: cobalt with a white halo. */
const MARKER_FILL = "#0c54cc";
const MARKER_HALO = "#ffffff";
/** JPEG has no transparency: see-through parts of the surface show white, as on screen. */
const BACKDROP = "#ffffff";

/** The pin's teardrop: rounded on three corners, its sharp bottom-left corner on the point. */
function drawMarker(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const round = size / 2;
  const tip = size / 8;
  context.beginPath();
  context.roundRect(x, y - size, size, size, [round, round, round, tip]);
  context.lineWidth = Math.max(2, size / 8);
  context.strokeStyle = MARKER_HALO;
  context.stroke();
  context.fillStyle = MARKER_FILL;
  context.fill();
  context.beginPath();
  context.arc(x + size / 2, y - size / 2, size / 7, 0, Math.PI * 2);
  context.fillStyle = MARKER_HALO;
  context.fill();
}

/**
 * The planned region at `fraction` of the plan's output size. The marker is
 * drawn last, at that size, so it stays sharp however small the crop gets.
 */
function drawCrop(
  source: CanvasImageSource,
  plan: CropPlan,
  fraction: number,
): HTMLCanvasElement | null {
  const { rect, pin } = plan;
  const scale = plan.scale * fraction;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = BACKDROP;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const markerSize = plan.markerSize * fraction;
  drawMarker(context, (pin.x - rect.x) * scale, (pin.y - rect.y) * scale, markerSize);
  return canvas;
}

/** Hands a canvas's bitmap back at once instead of waiting for collection. */
function release(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Cuts the planned region out of `source` and marks the pin on it, as a JPEG
 * that fits a share (`CROP_BUDGET_BYTES`). Quality steps reuse one drawing;
 * a smaller size is drawn afresh from `source`.
 */
export async function renderCrop(source: CanvasImageSource, plan: CropPlan): Promise<Blob | null> {
  // Nothing is drawn at fraction 0, so the first step always draws.
  const drawn: { fraction: number; canvas: HTMLCanvasElement | null } = {
    fraction: 0,
    canvas: null,
  };
  const encode = (step: CropStep) => {
    if (drawn.fraction !== step.scale) {
      release(drawn.canvas);
      drawn.fraction = step.scale;
      drawn.canvas = drawCrop(source, plan, step.scale);
    }
    return drawn.canvas ? toJpeg(drawn.canvas, step.quality) : Promise.resolve(null);
  };
  const edge = Math.max(plan.rect.width, plan.rect.height) * plan.scale;
  try {
    return await encodeWithinBudget(encode, edge);
  } finally {
    release(drawn.canvas);
  }
}
