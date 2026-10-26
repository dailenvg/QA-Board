import { MB, SHARE_LIMITS } from "../share/limits";
import { commentsFor } from "../store/selectors";
import { pagesOf } from "../store/pages";
import { snapshotsFor } from "../store/snapshots";
import type { Project, SquintData } from "../store/types";

/** One image the share would hold, as found in this browser. */
export interface ShareImage {
  kind: "page" | "snapshot" | "crop";
  size: number;
  /** How to name it to the owner (pages only). */
  label?: string;
}

const megabytes = (bytes: number) => `${Math.ceil(bytes / MB)} MB`;

/**
 * Why the project can't be shared, before anything is uploaded; null when it
 * fits. A page over its limit can never be shared; snapshots and screenshots
 * over theirs are left out by the server, so they don't count toward the total.
 */
export function shareSizeProblem(images: readonly ShareImage[]): string | null {
  const page = images.find(
    (image) => image.kind === "page" && image.size > SHARE_LIMITS.blobBytes.page,
  );
  if (page) {
    return `This project is too big to share: ${page.label ?? "a page"} is ${megabytes(page.size)}, and a shared page can be up to ${megabytes(SHARE_LIMITS.blobBytes.page)}. Make a new project from a smaller copy of that image, then share that.`;
  }
  const total = images
    .filter((image) => image.size <= SHARE_LIMITS.blobBytes[image.kind])
    .reduce((sum, image) => sum + image.size, 0);
  if (total <= SHARE_LIMITS.totalBytes) return null;
  // Pages are stored to fit (`pageByteBudget`), so what tips it over is snapshots and screenshots.
  return `This project is too big to share: its images add up to ${megabytes(total)}, and a share link holds up to ${megabytes(SHARE_LIMITS.totalBytes)}. Comment screenshots and earlier snapshots count too: delete comments you no longer need, then try again.`;
}

/** Every image a share of `project` would upload, by its size in this browser (missing ones skipped). */
export async function shareImages(
  data: SquintData,
  project: Project,
  read: (key: string) => Promise<Blob | null>,
): Promise<ShareImage[]> {
  const wanted: Array<{ key: string; kind: ShareImage["kind"]; label?: string }> = [
    ...pagesOf(project).map((page, index) => ({
      key: page.blobKey,
      kind: "page" as const,
      label: `page ${index + 1}`,
    })),
    ...snapshotsFor(data, project.id).map((snapshot) => ({
      key: snapshot.blobKey,
      kind: "snapshot" as const,
    })),
    ...commentsFor(data, project.id).flatMap((comment) =>
      comment.crop ? [{ key: comment.crop.blobKey, kind: "crop" as const }] : [],
    ),
  ];
  const found = await Promise.all(
    wanted.map(async ({ key, ...image }) => {
      const blob = await read(key);
      return blob ? [{ ...image, size: blob.size }] : [];
    }),
  );
  return found.flat();
}
