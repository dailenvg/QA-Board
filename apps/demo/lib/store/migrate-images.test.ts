import { describe, expect, it, vi } from "vitest";
import { migrateImages, type ImageStore } from "./migrate-images";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function store(results: boolean[]): ImageStore & { removed: string[]; held: string[] } {
  const removed: string[] = [];
  const held: string[] = [];
  let call = 0;
  return {
    removed,
    held,
    put: vi.fn(() => Promise.resolve(results[call++] ?? true)),
    remove: (keys) => {
      removed.push(...keys);
      return Promise.resolve();
    },
    hold: (key) => void held.push(key),
  };
}

describe("migrateImages", () => {
  const images = [
    { key: "image:a", dataUrl: PNG },
    { key: "image:b", dataUrl: PNG },
  ];

  it("stores every image as a blob", async () => {
    const target = store([true, true]);
    expect(await migrateImages(images, target)).toBe(true);
    expect(target.put).toHaveBeenCalledTimes(2);
    expect(target.held).toEqual([]);
  });

  it("is all or nothing: a refused write undoes the others and holds all in memory", async () => {
    const target = store([true, false]);
    expect(await migrateImages(images, target)).toBe(false);
    expect(target.removed).toEqual(["image:a"]);
    expect(target.held).toEqual(["image:a", "image:b"]);
  });
});
