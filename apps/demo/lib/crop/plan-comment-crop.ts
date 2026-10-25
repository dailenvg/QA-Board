import { planCrop, type Box, type CropPlan } from "./geometry";

function box(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The scroll container's box, clipped to the window. */
function visibleBox(container: HTMLElement): Box {
  const rect = container.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Reads what the commenter sees right now. Call it synchronously when the
 * comment is posted, before anything re-renders or scrolls.
 */
export function planCommentCrop(
  image: HTMLImageElement,
  container: HTMLElement,
  pin: { x: number; y: number },
): CropPlan | null {
  return planCrop({
    image: box(image.getBoundingClientRect()),
    view: visibleBox(container),
    natural: { width: image.naturalWidth, height: image.naturalHeight },
    pin,
  });
}
