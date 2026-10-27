import { describe, expect, it } from "vitest";
import { NO_DEFAULT_FOLDER_SINCE, withoutLegacyFolder } from "./legacy-folder";
import { parseData } from "./persist";
import type { Folder, Project, SquintData } from "./types";

const BEFORE = NO_DEFAULT_FOLDER_SINCE - 60_000;

/** The folder every new browser got before the cutoff, exactly as the old seed made it. */
const LEFTOVER: Folder = { id: "default", name: "My projects", createdAt: BEFORE, parentId: null };

const PROJECT: Project = {
  id: "p1",
  folderId: "default",
  name: "Homepage",
  source: { kind: "url", url: "https://example.com/" },
  createdAt: BEFORE,
  updatedAt: BEFORE,
};

function workspace(overrides: Partial<SquintData> = {}): SquintData {
  return {
    version: 3,
    folders: [LEFTOVER],
    projects: [],
    comments: [],
    snapshots: [],
    revocations: [],
    authorName: null,
    ...overrides,
  };
}

describe("withoutLegacyFolder", () => {
  it("removes the untouched leftover, keeping everything else", () => {
    expect(withoutLegacyFolder(workspace())).toEqual(workspace({ folders: [] }));
  });

  it.each<[string, SquintData]>([
    ["renamed", workspace({ folders: [{ ...LEFTOVER, name: "Clients" }] })],
    ["holding a project", workspace({ projects: [PROJECT] })],
    ["next to another folder", workspace({ folders: [LEFTOVER, { ...LEFTOVER, id: "f2" }] })],
    [
      "with a subfolder",
      workspace({ folders: [LEFTOVER, { ...LEFTOVER, id: "sub", parentId: LEFTOVER.id }] }),
    ],
    [
      "made at the cutoff",
      workspace({ folders: [{ ...LEFTOVER, createdAt: NO_DEFAULT_FOLDER_SINCE }] }),
    ],
    ["made after the cutoff", workspace({ folders: [{ ...LEFTOVER, createdAt: Date.now() }] })],
    [
      "with a revocation pending",
      workspace({
        revocations: [{ shareId: "s1", ownerKey: "k", projectId: "gone", dueAt: BEFORE }],
      }),
    ],
    ["after a comment author was saved", workspace({ authorName: "Ana" })],
  ])("keeps the folder when it's %s", (_case, data) => {
    expect(withoutLegacyFolder(data)).toBe(data);
  });

  it("keeps the recovered folder, which only exists for projects", () => {
    const parsed = parseData(JSON.stringify(workspace({ folders: [], projects: [PROJECT] })));
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.data.folders).toEqual([LEFTOVER]);
    expect(withoutLegacyFolder(parsed.data)).toBe(parsed.data);
  });

  it("leaves a workspace with no folders as it is", () => {
    const data = workspace({ folders: [] });
    expect(withoutLegacyFolder(data)).toBe(data);
  });
});
