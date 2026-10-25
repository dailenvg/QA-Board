import type { CropPlan } from "./geometry";

/** Pin colors are fixed (not themed), as on the canvas: cobalt with a white halo. */
const MARKER_FILL = "#0c54cc";
const MARKER_HALO = "#ffffff";

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

/** Cuts the planned region out of `source` and marks the pin on it, as a PNG. */
export function renderCrop(source: CanvasImageSource, plan: CropPlan): Promise<Blob | null> {
  const { rect, scale, pin, markerSize } = plan;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
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
  drawMarker(context, (pin.x - rect.x) * scale, (pin.y - rect.y) * scale, markerSize);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
