import { describe, expect, it } from "vitest";
import { reduce } from "../store/reducer";
import type { WorkspaceData, WorkspaceProject } from "../workspace/types";
import {
  fileOrphans,
  projectsMissingLinks,
  RESTORED_FOLDER_NAME,
  toSquintData,
} from "./workspace-data";

const project = (id: string, folderId: string | null, share = false): WorkspaceProject => ({
  id,
  folderId,
  name: id,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt: 2,
  label: null,
  archivedAt: null,
  ...(share ? { share: { id: `share-${id}`, createdAt: 3, cursor: 4, lastSyncedAt: 5 } } : {}),
});

function workspace(projects: WorkspaceProject[], folders = true): WorkspaceData {
  return {
    workspace: { id: "w1", slug: "acme", name: "Acme" },
    folders: folders
      ? [
          { id: "newer", name: "Newer", createdAt: 9, parentId: null },
          { id: "older", name: "Older", createdAt: 1, parentId: null },
        ]
      : [],
    projects,
    snapshots: [],
    comments: [],
    storage: { bytes: 0, blobCount: 0, quotaBytes: 1 },
    authorName: "Ana",
  };
}

const LINK = {
  id: "share-p2",
  token: "token",
  ownerKey: "owner",
  createdAt: 3,
  cursor: 0,
};

describe("toSquintData", () => {
  it("shows a review link once its secrets are known, with the server's sync position", () => {
    const data = workspace([project("p1", "older"), project("p2", "older", true)]);
    expect(toSquintData(data, new Map()).projects[1]).not.toHaveProperty("share");
    expect(projectsMissingLinks(data, new Map())).toEqual(["p2"]);

    const links = new Map([[LINK.id, LINK]]);
    expect(toSquintData(data, links).projects[1]?.share).toEqual({
      id: "share-p2",
      token: "token",
      ownerKey: "owner",
      createdAt: 3,
      cursor: 4,
      lastSyncedAt: 5,
    });
    expect(projectsMissingLinks(data, links)).toEqual([]);
    expect(toSquintData(data, links)).toMatchObject({ revocations: [], authorName: "Ana" });
  });
});

describe("fileOrphans", () => {
  it("files a project without a folder into the oldest folder", () => {
    const data = toSquintData(workspace([project("p1", null)]), new Map());
    const actions = fileOrphans(data, 50, () => "unused");
    expect(actions).toEqual([{ type: "project/move", id: "p1", folderId: "older", at: 50 }]);
    const filed = actions.reduce(reduce, data);
    expect(filed.projects[0]?.folderId).toBe("older");
  });

  it("makes a folder for them when the workspace has none", () => {
    const data = toSquintData(workspace([project("p1", null)], false), new Map());
    const filed = fileOrphans(data, 50, () => "made").reduce(reduce, data);
    expect(filed.folders).toEqual([
      { id: "made", name: RESTORED_FOLDER_NAME, createdAt: 50, parentId: null },
    ]);
    expect(filed.projects[0]?.folderId).toBe("made");
  });

  it("does nothing when every project has a folder", () => {
    const data = toSquintData(workspace([project("p1", "newer")]), new Map());
    expect(fileOrphans(data, 50, () => "unused")).toEqual([]);
  });
});
