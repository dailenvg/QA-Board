import { describe, expect, it } from "vitest";
import { pngHeader } from "@/test/image-headers";
import type { BlobLocation } from "../share/types";
import { done, refuse } from "../workspace/query-result";
import type { CheckedImage } from "./image-check";
import { storeImage } from "./image-store";

const IMAGE: CheckedImage = {
  bytes: pngHeader(64, 64),
  contentType: "image/png",
  width: 64,
  height: 64,
};
const PATH = "ws/00000000-0000-4000-8000-000000000001/brand/logo/new";
const OLD: BlobLocation = { kind: "vercel", url: "https://store.test/old" };

function store() {
  const discarded: string[] = [];
  return {
    discarded,
    driver: {
      put: (pathname: string) =>
        Promise.resolve({ kind: "vercel" as const, url: `https://store.test/${pathname}` }),
      discard: (locations: readonly BlobLocation[]) => {
        for (const location of locations) {
          if (location.kind === "vercel") discarded.push(location.url);
        }
        return Promise.resolve();
      },
    },
  };
}

describe("storeImage", () => {
  it("deletes the replaced file only once the change is recorded", async () => {
    const { driver, discarded } = store();
    const seen: string[] = [];
    const stored = await storeImage(driver, PATH, IMAGE, (location, size) => {
      seen.push(location.kind === "vercel" ? location.url : "inline", String(size));
      expect(discarded).toEqual([]);
      return Promise.resolve(done({ replaced: OLD }));
    });
    expect(stored.ok && stored.value.version).toMatch(/^[0-9a-f]{16}$/);
    expect(seen).toEqual([`https://store.test/${PATH}`, String(IMAGE.bytes.length)]);
    expect(discarded).toEqual([OLD.kind === "vercel" ? OLD.url : ""]);
  });

  it("deletes the new file, and keeps the old one, when recording refuses or fails", async () => {
    const refused = store();
    const result = await storeImage(refused.driver, PATH, IMAGE, () =>
      Promise.resolve(refuse("quota")),
    );
    expect(result).toEqual({ ok: false, reason: "quota" });
    expect(refused.discarded).toEqual([`https://store.test/${PATH}`]);

    const failed = store();
    await expect(
      storeImage(failed.driver, PATH, IMAGE, () => Promise.reject(new Error("database down"))),
    ).rejects.toThrow("database down");
    expect(failed.discarded).toEqual([`https://store.test/${PATH}`]);
  });
});
