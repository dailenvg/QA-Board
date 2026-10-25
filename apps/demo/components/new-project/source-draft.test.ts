import { describe, expect, it } from "vitest";
import { imagesProblem, pdfProblem, readyImages } from "./source-draft";
import type { PickedImage } from "./use-picked-images";

const image = { blob: new Blob(["x"]), fileName: "a.png", width: 10, height: 10 };
const ready: PickedImage = { key: "a", fileName: "a.png", status: "ready", image };

describe("source drafts", () => {
  it("say why images can't be used yet", () => {
    expect(imagesProblem([])).toBe("Choose an image.");
    expect(imagesProblem([ready, { key: "b", fileName: "b.png", status: "preparing" }])).toBe(
      "Wait for the images to finish preparing.",
    );
    expect(
      imagesProblem([ready, { key: "c", fileName: "c.png", status: "failed", error: "Bad" }]),
    ).toBe("Remove the images that couldn't be prepared, then try again.");
    expect(imagesProblem([ready])).toBeNull();
    expect(readyImages([ready])).toEqual([image]);
  });

  it("say why a PDF can't be used yet", () => {
    expect(pdfProblem({ status: "idle" })).toBe("Choose a PDF.");
    expect(pdfProblem({ status: "rendering", fileName: "d.pdf", page: 2, total: 3 })).toBe(
      "Wait for the PDF to finish rendering.",
    );
    expect(pdfProblem({ status: "confirm", fileName: "d.pdf", pageCount: 60 })).toBe(
      "Use the first 50 pages, or choose another PDF.",
    );
    expect(pdfProblem({ status: "failed", fileName: "d.pdf", error: "Broken" })).toBe("Broken");
    expect(pdfProblem({ status: "ready", fileName: "d.pdf", pages: [image] })).toBeNull();
  });
});
