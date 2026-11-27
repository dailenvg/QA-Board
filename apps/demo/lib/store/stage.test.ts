import { describe, expect, it } from "vitest";
import { reduce } from "./reducer";
import { PROJECT_STAGES, STAGE_LABEL, withStage } from "./stage";
import type { Project, SquintData } from "./types";

const project = (id: string, over: Partial<Project> = {}): Project => ({
  id,
  folderId: "f1",
  name: id,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const DATA: SquintData = {
  version: 3,
  folders: [{ id: "f1", name: "Work", createdAt: 0, parentId: null }],
  projects: [project("p1"), project("p2", { stage: "editing", stageChangedAt: 5 })],
  comments: [],
  snapshots: [],
  replies: [],
  authorName: null,
};

describe("project stages", () => {
  it("names each stage as W1 says, in the menus' order", () => {
    expect(PROJECT_STAGES.map((stage) => STAGE_LABEL[stage])).toEqual([
      "With client",
      "Editing",
      "On hold",
      "Approved",
    ]);
  });

  it("sets a stage with when it changed, and clears both", () => {
    expect(withStage(project("p1"), "approved", 9)).toEqual(
      project("p1", { stage: "approved", stageChangedAt: 9 }),
    );
    expect(withStage(project("p1", { stage: "approved", stageChangedAt: 9 }), null, 10)).toEqual(
      project("p1"),
    );
  });
});

describe("the project/stage action", () => {
  it("sets a stage, changes it and clears it, leaving updatedAt alone", () => {
    const set = reduce(DATA, { type: "project/stage", id: "p1", stage: "on-hold", at: 7 });
    expect(set.projects[0]).toEqual(project("p1", { stage: "on-hold", stageChangedAt: 7 }));
    const changed = reduce(set, { type: "project/stage", id: "p1", stage: "approved", at: 8 });
    expect(changed.projects[0]).toMatchObject({
      stage: "approved",
      stageChangedAt: 8,
      updatedAt: 1,
    });
    const cleared = reduce(changed, { type: "project/stage", id: "p1", stage: null, at: 9 });
    expect(cleared.projects[0]).toEqual(project("p1"));
    expect(cleared.projects[1]).toBe(DATA.projects[1]);
  });

  it("changes nothing for the stage a project already has, or an unknown project", () => {
    expect(reduce(DATA, { type: "project/stage", id: "p2", stage: "editing", at: 9 })).toBe(DATA);
    expect(reduce(DATA, { type: "project/stage", id: "p1", stage: null, at: 9 })).toBe(DATA);
    expect(reduce(DATA, { type: "project/stage", id: "nope", stage: "approved", at: 9 })).toBe(
      DATA,
    );
  });
});
