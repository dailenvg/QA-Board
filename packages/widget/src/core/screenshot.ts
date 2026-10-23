import type { Point } from "./geometry";
import { MAX_SCREENSHOT_BYTES } from "./types";

export interface ScreenshotOptions {
  /** Node to leave out of the capture (the widget host). */
  exclude: Element;
  /** Optional pin location (viewport coordinates) to mark on the image. */
  marker?: Point | null;
  maxBytes?: number;
  timeoutMs?: number;
}

const DOWNSCALE_STEPS = [1, 0.75, 0.5, 0.35] as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const MARKER_COLOR = "#c2410c";
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Decoded byte length of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Screenshot timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function pageBackground(doc: Document): string {
  for (const element of [doc.body, doc.documentElement]) {
    const color = getComputedStyle(element).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
  }
  return "#ffffff";
}

async function renderViewport(exclude: Element): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import("html-to-image");
  const doc = document;
  return toCanvas(doc.documentElement, {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: 1,
    backgroundColor: pageBackground(doc),
    imagePlaceholder: TRANSPARENT_PIXEL,
    style: {
      transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
      transformOrigin: "top left",
    },
    filter: (node) => node !== exclude,
  });
}

function drawMarker(canvas: HTMLCanvasElement, marker: Point): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = canvas.width / window.innerWidth;
  context.beginPath();
  context.arc(marker.x * scale, marker.y * scale, 9 * scale, 0, Math.PI * 2);
  context.fillStyle = MARKER_COLOR;
  context.fill();
  context.lineWidth = 3 * scale;
  context.strokeStyle = "#ffffff";
  context.stroke();
}

function scaled(source: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  if (factor === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * factor);
  canvas.height = Math.round(source.height * factor);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encodeWithinBudget(canvas: HTMLCanvasElement, maxBytes: number): string | null {
  for (const factor of DOWNSCALE_STEPS) {
    const dataUrl = scaled(canvas, factor).toDataURL("image/png");
    if (estimateDataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
  }
  return null;
}

/**
 * Captures the visible viewport as a PNG data URL. Never throws: cross-origin
 * assets, tainted canvases, and timeouts all resolve to null so the comment
 * can still be submitted without a screenshot.
 */
export async function captureViewport(options: ScreenshotOptions): Promise<string | null> {
  try {
    const canvas = await withTimeout(
      renderViewport(options.exclude),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (options.marker) drawMarker(canvas, options.marker);
    return encodeWithinBudget(canvas, options.maxBytes ?? MAX_SCREENSHOT_BYTES);
  } catch (error) {
    console.warn("[pinpoint] Screenshot failed; submitting without it.", error);
    return null;
  }
}
