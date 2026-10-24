import { createArtJob, type ArtJob, type ArtRecipe } from "./art";

/**
 * One shared painter: every folder on the page queues its art here and the
 * queue spends a few milliseconds a frame, so a grid of folders never janks.
 */

/** Work per animation frame, in ms. */
const FRAME_BUDGET = 7;
/** Rows of work per step; small enough to check the clock often. */
const ROWS_PER_STEP = 4;
/** Painted sizes snap to this many pixels, so resizing a folder rarely repaints it. */
const SIZE_STEP = 20;
/** Finished paintings kept for reuse (navigating back, identical folders). Oldest go first. */
const CACHE_LIMIT = 32;

const cache = new Map<string, Promise<HTMLCanvasElement>>();
const queue: { job: ArtJob; done: (canvas: HTMLCanvasElement) => void }[] = [];
let pumping = false;

function finish(job: ArtJob): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = job.width;
  canvas.height = job.height;
  canvas.getContext("2d")?.putImageData(new ImageData(job.pixels, job.width, job.height), 0, 0);
  return canvas;
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const tick = () => {
    const until = performance.now() + FRAME_BUDGET;
    while (queue.length > 0 && performance.now() < until) {
      const head = queue[0];
      if (head?.job.step(ROWS_PER_STEP)) {
        queue.shift();
        head.done(finish(head.job));
      }
    }
    if (queue.length > 0) requestAnimationFrame(tick);
    else pumping = false;
  };
  requestAnimationFrame(tick);
}

/**
 * Bitmap size for a painting shown at `width` x `height` CSS px with `density`
 * device pixels each. The width rounds up to the next SIZE_STEP and the height
 * follows the aspect ratio, so neighbouring sizes share one painting.
 */
export function paintSize(
  width: number,
  height: number,
  density: number,
): { width: number; height: number } {
  const w = Math.max(SIZE_STEP, Math.ceil((width * density) / SIZE_STEP) * SIZE_STEP);
  return { width: w, height: Math.round((w * height) / width) };
}

/** Queues (or reuses) a painting. Resolves with a canvas to copy from. */
export function paint(
  recipe: ArtRecipe,
  seed: number,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const key = `${recipe.name}:${seed}:${width}x${height}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const painting = new Promise<HTMLCanvasElement>((done) => {
    queue.push({ job: createArtJob(width, height, recipe, seed), done });
    pump();
  });
  cache.set(key, painting);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return painting;
}
