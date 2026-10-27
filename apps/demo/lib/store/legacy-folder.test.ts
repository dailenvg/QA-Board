import { describe, expect, it } from "vitest";
import { NO_DEFAULT_FOLDER_SINCE, withoutLegacyFolder } from "./legacy-folder";
import { parseData } from "./persist";
import type { Comment, Folder, Project, SquintData, Snapshot } from "./types";

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

/** A comment on a project that's no longer there. */
const COMMENT: Comment = {
  id: "c1",
  projectId: "gone",
  x: 10,
  y: 20,
  body: "Tighten the hero copy.",
  author: "Ana",
  status: "active",
  createdAt: BEFORE,
  updatedAt: BEFORE,
};

/** A snapshot of a project that's no longer there. */
const SNAPSHOT: Snapshot = {
  id: "s1",
  projectId: "gone",
  width: 1280,
  height: 4000,
  createdAt: BEFORE,
  blobKey: "snapshot:s1",
  sourceUrl: "https://example.com/",
};

function workspace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

/** Loads `stored` as the store does: parsed and repaired, then checked against what was saved. */
function check(stored: Record<string, unknown>): { before: SquintData; after: SquintData } {
  const raw = JSON.stringify(stored);
  const parsed = parseData(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  return { before: parsed.data, after: withoutLegacyFolder(parsed, raw) };
}

describe("withoutLegacyFolder", () => {
  it("removes the untouched leftover, keeping everything else", () => {
    const { before, after } = check(workspace());
    expect(after).toEqual({ ...before, folders: [] });
  });

  it("removes it from older data that has no snapshots or revocations lists", () => {
    const { snapshots: _s, revocations: _r, ...old } = workspace({ version: 2 });
    expect(check(old).after.folders).toEqual([]);
  });

  it.each<[string, Record<string, unknown>]>([
    ["renamed", workspace({ folders: [{ ...LEFTOVER, name: "Clients" }] })],
    ["named My Projects", workspace({ folders: [{ ...LEFTOVER, name: "My Projects" }] })],
    [
      "named with a trailing space",
      workspace({ folders: [{ ...LEFTOVER, name: "My projects " }] }),
    ],
    ["named in lower case", workspace({ folders: [{ ...LEFTOVER, name: "my projects" }] })],
    ["a person's own, with another id", workspace({ folders: [{ ...LEFTOVER, id: "f-8k2q" }] })],
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
    ["stored with only a comment", workspace({ comments: [COMMENT] })],
    ["stored with only a snapshot", workspace({ snapshots: [SNAPSHOT] })],
    [
      "stored with a javascript: project",
      workspace({
        projects: [{ ...PROJECT, source: { kind: "url", url: "javascript:alert(1)" } }],
      }),
    ],
    [
      "with a revocation pending",
      workspace({
        revocations: [{ shareId: "s1", ownerKey: "k", projectId: "gone", dueAt: BEFORE }],
      }),
    ],
    ["stored with an unreadable revocation", workspace({ revocations: [{ shareId: 1 }] })],
    ["after a comment author was saved", workspace({ authorName: "Ana" })],
  ])("keeps the folder when it's %s", (_case, stored) => {
    const { before, after } = check(stored);
    expect(after).toBe(before);
  });

  it("keeps the recovered folder, which only exists for projects", () => {
    const { before, after } = check(workspace({ folders: [], projects: [PROJECT] }));
    expect(before.folders).toEqual([LEFTOVER]);
    expect(after).toBe(before);
  });

  it("leaves a workspace with no folders as it is", () => {
    const { before, after } = check(workspace({ folders: [] }));
    expect(after).toBe(before);
  });
});
