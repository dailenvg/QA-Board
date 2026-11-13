import { describe, expect, it } from "vitest";
import type { Comment, Folder, Project, SquintData } from "../store/types";
import type { ClientCommentActivity } from "../workspace/types";
import {
  commentTotals,
  leavingSoon,
  isNewSince,
  newFromClients,
  oldestOpen,
  percentOf,
  recentProjects,
  resolvedPercent,
} from "./activity";

const folder = (id: string, createdAt: number): Folder => ({
  id,
  name: `Folder ${id}`,
  createdAt,
  parentId: null,
});

const project = (id: string, folderId: string, updatedAt: number, cursor?: number): Project => ({
  id,
  folderId,
  name: `Project ${id}`,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt,
  ...(cursor === undefined
    ? {}
    : {
        share: {
          id: `share-${id}`,
          token: "t",
          ownerKey: "o",
          createdAt: 1,
          cursor,
          reviewWindowHours: null,
          reviewEndsAt: null,
        },
      }),
});

const comment = (
  id: string,
  projectId: string,
  createdAt: number,
  extra: Partial<Comment> = {},
): Comment => ({
  id,
  projectId,
  x: 1,
  y: 1,
  body: `Body ${id}`,
  author: "Ana",
  status: "active",
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

function data(parts: Partial<SquintData>): SquintData {
  return {
    version: 3,
    folders: [],
    projects: [],
    comments: [],
    snapshots: [],
    authorName: null,
    ...parts,
  };
}

const WORKSPACE = data({
  folders: [folder("old", 1), folder("new", 2)],
  projects: [project("a", "old", 30), project("b", "new", 50), project("c", "new", 40)],
  comments: [
    comment("c1", "a", 20),
    comment("c2", "b", 10),
    comment("c3", "b", 15, { status: "resolved" }),
    comment("c4", "c", 12, { fromClient: true }),
    // Its project is gone: never counted.
    comment("c5", "gone", 1),
  ],
});

describe("overview activity", () => {
  it("counts open and resolved comments", () => {
    expect(commentTotals(WORKSPACE)).toEqual({ open: 3, resolved: 1 });
    expect(commentTotals(data({}))).toEqual({ open: 0, resolved: 0 });
  });

  it("rounds percentages without reading 100% or 0% before it's all or none", () => {
    expect(resolvedPercent({ open: 1, resolved: 199 })).toBe(99);
    expect(resolvedPercent({ open: 199, resolved: 1 })).toBe(1);
    expect(resolvedPercent({ open: 3, resolved: 1 })).toBe(25);
    expect(resolvedPercent({ open: 0, resolved: 4 })).toBe(100);
    expect(resolvedPercent({ open: 4, resolved: 0 })).toBe(0);
    expect(resolvedPercent({ open: 0, resolved: 0 })).toBe(0);
    expect(percentOf(2, 3)).toBe(67);
  });

  it("lists the oldest open comments first, with their project", () => {
    expect(oldestOpen(WORKSPACE, 2)).toEqual([
      {
        id: "c2",
        projectId: "b",
        projectName: "Project b",
        body: "Body c2",
        author: "Ana",
        createdAt: 10,
        fromClient: false,
      },
      {
        id: "c4",
        projectId: "c",
        projectName: "Project c",
        body: "Body c4",
        author: "Ana",
        createdAt: 12,
        fromClient: true,
      },
    ]);
    expect(oldestOpen(data({}))).toEqual([]);
  });

  it("lists recently updated projects, marking what changed since the last visit", () => {
    expect(recentProjects(WORKSPACE, 35)).toEqual([
      { id: "b", name: "Project b", folderName: "Folder new", updatedAt: 50, open: 1, isNew: true },
      { id: "c", name: "Project c", folderName: "Folder new", updatedAt: 40, open: 1, isNew: true },
      {
        id: "a",
        name: "Project a",
        folderName: "Folder old",
        updatedAt: 30,
        open: 1,
        isNew: false,
      },
    ]);
    // Until the last visit is known, nothing is marked new.
    expect(recentProjects(WORKSPACE, null, 1).map((row) => row.isNew)).toEqual([false]);
  });

  it("says something is new only after the last visit", () => {
    expect(isNewSince(11, 10)).toBe(true);
    expect(isNewSince(10, 10)).toBe(false);
    expect(isNewSince(11, null)).toBe(false);
  });

  describe("new from clients", () => {
    const activity = (entry: Partial<ClientCommentActivity>): ClientCommentActivity => ({
      projectId: "a",
      open: 0,
      latestAt: 0,
      waiting: [],
      cursor: 5,
      ...entry,
    });
    const shared = data({
      folders: [folder("old", 1)],
      projects: [project("a", "old", 1, 5), project("b", "old", 1)],
      comments: [
        comment("pulled-new", "a", 100, { fromClient: true }),
        comment("pulled-old", "a", 10, { fromClient: true, status: "resolved" }),
        comment("team-new", "b", 100),
        comment("client-resolved", "b", 90, { fromClient: true, status: "resolved" }),
      ],
    });

    it("adds pulled comments and those still on review links, per project, newest first", () => {
      const news = newFromClients(shared, [activity({ waiting: [120, 60, 40] })], 50);
      expect(news).toEqual({
        total: 4,
        waiting: 2,
        rows: [
          { projectId: "a", projectName: "Project a", count: 3, latestAt: 120 },
          { projectId: "b", projectName: "Project b", count: 1, latestAt: 90 },
        ],
      });
      expect(newFromClients(shared, [], 50).rows).toHaveLength(2);
    });

    it("doesn't count waiting comments again once a pull has brought them in", () => {
      const pulledSince = data({ ...shared, projects: [project("a", "old", 1, 9)] });
      expect(newFromClients(pulledSince, [activity({ waiting: [120] })], 50)).toEqual({
        total: 1,
        waiting: 0,
        rows: [{ projectId: "a", projectName: "Project a", count: 1, latestAt: 100 }],
      });
    });

    it("leaves out projects the workspace no longer has", () => {
      expect(
        newFromClients(data({}), [activity({ projectId: "gone", waiting: [120] })], 0),
      ).toEqual({ total: 0, waiting: 0, rows: [] });
    });
  });

  describe("leaving soon", () => {
    const archived = (id: string, folderId: string, deleteAfter: number): Project => ({
      ...project(id, folderId, 1),
      archivedAt: deleteAfter - 30,
      deleteAfter,
    });

    it("lists archived projects only, the one deleted soonest first", () => {
      const workspace = data({
        ...WORKSPACE,
        projects: [
          ...WORKSPACE.projects,
          archived("late", "old", 900),
          archived("soon", "new", 300),
          archived("lost", "gone", 600),
        ],
      });
      expect(leavingSoon(workspace)).toEqual([
        {
          id: "soon",
          name: "Project soon",
          folderName: "Folder new",
          archivedAt: 270,
          deleteAfter: 300,
        },
        { id: "lost", name: "Project lost", folderName: null, archivedAt: 570, deleteAfter: 600 },
        {
          id: "late",
          name: "Project late",
          folderName: "Folder old",
          archivedAt: 870,
          deleteAfter: 900,
        },
      ]);
      expect(leavingSoon(workspace, 1).map((row) => row.id)).toEqual(["soon"]);
    });

    it("is empty with nothing archived", () => {
      expect(leavingSoon(WORKSPACE)).toEqual([]);
    });
  });
});
