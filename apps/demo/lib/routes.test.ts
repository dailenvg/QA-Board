import { describe, expect, it } from "vitest";
import {
  ADMIN_AUDIT_HREF,
  ADMIN_HREF,
  FOLDERS_HREF,
  folderHref,
  isAccountPath,
  isAdminPath,
  isFoldersPath,
  OVERVIEW_HREF,
} from "./routes";

describe("routes", () => {
  it("puts the folder grid and every folder's page in the Folders section", () => {
    expect(isFoldersPath(FOLDERS_HREF)).toBe(true);
    expect(isFoldersPath(folderHref("a b"))).toBe(true);
    for (const elsewhere of [OVERVIEW_HREF, "/folders-old", "/fx", "/account", "/p/f"]) {
      expect(isFoldersPath(elsewhere)).toBe(false);
    }
    expect(isAccountPath(FOLDERS_HREF)).toBe(false);
  });

  it("puts the admin's Overview and every page under it in the admin panel", () => {
    expect(isAdminPath(ADMIN_HREF)).toBe(true);
    expect(isAdminPath(ADMIN_AUDIT_HREF)).toBe(true);
    for (const elsewhere of [OVERVIEW_HREF, "/administrator", "/account", "/api/admin"]) {
      expect(isAdminPath(elsewhere)).toBe(false);
    }
  });
});
