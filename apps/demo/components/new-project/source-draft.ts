import { MAX_PDF_PAGES } from "@/lib/pdf/render-pdf";
import type { ImageUpload } from "@/lib/store/actions";
import type { ImageGrouping } from "./CombineChoice";
import type { PdfImport } from "./use-pdf-import";
import type { PickedImage } from "./use-picked-images";

/** What the form collected: an address, prepared images and how to group them, or a PDF's pages. */
export type SourceDraft =
  | { kind: "url"; url: string }
  | { kind: "image"; images: ImageUpload[]; grouping: ImageGrouping }
  | { kind: "pdf"; fileName: string; pages: ImageUpload[] };

/** Why the chosen images can't be used yet, or null when they're all ready. */
export function imagesProblem(items: readonly PickedImage[]): string | null {
  if (items.length === 0) return "Choose an image.";
  if (items.some((item) => item.status === "preparing")) {
    return "Wait for the images to finish preparing.";
  }
  if (items.some((item) => item.status === "failed")) {
    return "Remove the images that couldn't be prepared, then try again.";
  }
  return null;
}

export const readyImages = (items: readonly PickedImage[]): ImageUpload[] =>
  items.flatMap((item) => (item.status === "ready" ? [item.image] : []));

/** Why the PDF can't be used yet, or null once its pages are ready. */
export function pdfProblem(state: PdfImport): string | null {
  switch (state.status) {
    case "idle":
      return "Choose a PDF.";
    case "opening":
    case "rendering":
      return "Wait for the PDF to finish rendering.";
    case "confirm":
      return `Use the first ${MAX_PDF_PAGES} pages, or choose another PDF.`;
    case "failed":
      return state.error;
    case "ready":
      return null;
  }
}
