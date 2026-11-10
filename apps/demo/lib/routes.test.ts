import { describe, expect, it } from "vitest";
import { FOLDERS_HREF, folderHref, isAccountPath, isFoldersPath, OVERVIEW_HREF } from "./routes";

describe("routes", () => {
  it("puts the folder grid and every folder's page in the Folders section", () => {
    expect(isFoldersPath(FOLDERS_HREF)).toBe(true);
    expect(isFoldersPath(folderHref("a b"))).toBe(true);
    for (const elsewhere of [OVERVIEW_HREF, "/folders-old", "/fx", "/account", "/p/f"]) {
      expect(isFoldersPath(elsewhere)).toBe(false);
    }
    expect(isAccountPath(FOLDERS_HREF)).toBe(false);
  });
});
