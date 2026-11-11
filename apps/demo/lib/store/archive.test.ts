import { describe, expect, it } from "vitest";
import { ARCHIVE_GRACE_MS } from "../workspace/limits";
import { activeData, cleanLabel, isArchived, workspaceLabels } from "./archive";
import { reduce } from "./reducer";
import type { Comment, Project, SquintData } from "./types";

const project = (id: string, over: Partial<Project> = {}): Project => ({
  id,
  folderId: "f1",
  name: id,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const comment = (id: string, projectId: string): Comment => ({
  id,
  projectId,
  x: 1,
  y: 1,
  body: "Fix",
  author: "Ana",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
});

const DATA: SquintData = {
  version: 3,
  folders: [{ id: "f1", name: "Work", createdAt: 0, parentId: null }],
  projects: [project("p1"), project("p2", { label: "Urgent" })],
  comments: [comment("c1", "p1"), comment("c2", "p2")],
  snapshots: [],
  authorName: null,
};

describe("archiving in the reducer", () => {
  it("archives with a deletion date ARCHIVE_GRACE_MS on, and keeps the first dates", () => {
    const archived = reduce(DATA, { type: "project/archive", id: "p1", archived: true, at: 10 });
    expect(archived.projects[0]).toMatchObject({
      archivedAt: 10,
      deleteAfter: 10 + ARCHIVE_GRACE_MS,
      updatedAt: 1,
    });
    expect(reduce(archived, { type: "project/archive", id: "p1", archived: true, at: 99 })).toBe(
      archived,
    );
  });

  it("unarchives by dropping both dates, and ignores what it doesn't know", () => {
    const archived = reduce(DATA, { type: "project/archive", id: "p1", archived: true, at: 10 });
    const back = reduce(archived, { type: "project/archive", id: "p1", archived: false, at: 11 });
    expect(back.projects[0]).toEqual(DATA.projects[0]);
    expect(reduce(DATA, { type: "project/archive", id: "p1", archived: false, at: 11 })).toBe(DATA);
    expect(reduce(DATA, { type: "project/archive", id: "nope", archived: true, at: 11 })).toBe(
      DATA,
    );
  });

  it("sets, replaces and clears a label, and changes nothing for the same one", () => {
    const set = reduce(DATA, { type: "project/label", id: "p1", label: "Draft" });
    expect(set.projects[0]?.label).toBe("Draft");
    expect(reduce(set, { type: "project/label", id: "p1", label: "Draft" })).toBe(set);
    const cleared = reduce(set, { type: "project/label", id: "p1", label: null });
    expect(cleared.projects[0]).not.toHaveProperty("label");
    expect(reduce(DATA, { type: "project/label", id: "p1", label: null })).toBe(DATA);
  });
});

describe("activeData", () => {
  it("leaves archived projects out with their comments, and is the same object without any", () => {
    expect(activeData(DATA)).toBe(DATA);
    const archived = reduce(DATA, { type: "project/archive", id: "p2", archived: true, at: 5 });
    const active = activeData(archived);
    expect(active.projects.map((entry) => entry.id)).toEqual(["p1"]);
    expect(active.comments.map((entry) => entry.id)).toEqual(["c1"]);
    expect(archived.projects.filter(isArchived).map((entry) => entry.id)).toEqual(["p2"]);
  });
});

describe("labels", () => {
  it("lists every label once, A to Z, archived projects' included", () => {
    const data: SquintData = {
      ...DATA,
      projects: [
        project("a", { label: "beta" }),
        project("b", { label: "Alpha", archivedAt: 1, deleteAfter: 2 }),
        project("c", { label: "beta" }),
        project("d"),
      ],
    };
    expect(workspaceLabels(data)).toEqual(["Alpha", "beta"]);
  });

  it("trims, collapses spaces and caps a typed label at 40 characters", () => {
    expect(cleanLabel("  Client   review ")).toBe("Client review");
    expect(cleanLabel("x".repeat(60))).toHaveLength(40);
  });
});
