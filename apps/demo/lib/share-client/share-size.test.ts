import { describe, expect, it } from "vitest";
import { MB } from "../share/limits";
import type { Project, SquintData } from "../store/types";
import { shareImages, shareSizeProblem } from "./share-size";

const project: Project = {
  id: "p",
  folderId: "f",
  name: "Mockups",
  source: {
    kind: "pages",
    origin: "image",
    pages: [
      { id: "a", blobKey: "page:a", name: "a.png" },
      { id: "b", blobKey: "image:p", name: "b.png" },
    ],
    fileName: "a.png",
  },
  createdAt: 1,
  updatedAt: 1,
};

const data: SquintData = {
  version: 3,
  folders: [{ id: "f", name: "F", createdAt: 1, parentId: null }],
  projects: [project],
  comments: [
    {
      id: "c",
      projectId: "p",
      x: 1,
      y: 1,
      body: "Hi",
      author: "Ana",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      pageId: "a",
      crop: { blobKey: "crop:c", rect: { x: 0, y: 0, width: 1, height: 1 } },
    },
  ],
  snapshots: [],
  revocations: [],
  authorName: null,
};

describe("share size", () => {
  it("reads every page, snapshot and screenshot the share would hold, skipping missing ones", async () => {
    const sizes: Record<string, number> = { "page:a": 3 * MB, "crop:c": 1000 };
    const read = (key: string) =>
      Promise.resolve(key in sizes ? new Blob([new Uint8Array(sizes[key] ?? 0)]) : null);
    expect(await shareImages(data, project, read)).toEqual([
      { kind: "page", size: 3 * MB, label: "page 1" },
      { kind: "crop", size: 1000 },
    ]);
  });

  it("fits up to 40 MB, not counting images the server would leave out anyway", () => {
    const page = (size: number) => ({ kind: "page" as const, size, label: "page 1" });
    expect(shareSizeProblem([page(15 * MB), page(15 * MB), page(10 * MB)])).toBeNull();
    expect(shareSizeProblem([page(1 * MB), { kind: "snapshot", size: 9 * MB }])).toBeNull();
    expect(shareSizeProblem([page(15 * MB), page(15 * MB), page(11 * MB)])).toBe(
      "This project is too big to share: its images add up to 41 MB, and a share link holds up to 40 MB. Comment screenshots and earlier snapshots count too: delete comments you no longer need, then try again.",
    );
  });

  it("names a page too big to share on its own", () => {
    expect(shareSizeProblem([{ kind: "page", size: 16 * MB, label: "page 3" }])).toBe(
      "This project is too big to share: page 3 is 16 MB, and a shared page can be up to 15 MB. Make a new project from a smaller copy of that image, then share that.",
    );
  });
});
