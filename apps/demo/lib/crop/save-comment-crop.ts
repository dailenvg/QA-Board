import { putBlob } from "../blob-store/blob-store";
import { cropBlobKey } from "../blob-store/keys";
import { attachCrop } from "../store/actions";
import { planCrop, type Box, type CropPlan } from "./geometry";
import { renderCrop } from "./render-crop";

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

/**
 * Renders and stores the crop, then attaches it to the comment. Best effort:
 * the comment is already saved, and without a crop it simply has no picture.
 * An image saved for a comment deleted meanwhile is swept later.
 */
export async function saveCommentCrop(
  commentId: string,
  image: HTMLImageElement,
  plan: CropPlan,
): Promise<void> {
  const blob = await renderCrop(image, plan);
  if (!blob) return;
  const blobKey = cropBlobKey(commentId);
  if (await putBlob(blobKey, blob)) attachCrop(commentId, { blobKey, rect: plan.rect });
}
