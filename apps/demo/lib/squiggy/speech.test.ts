import { describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "./mood-engine";
import {
  currentSpeech,
  PROJECT_NAME_MAX,
  reactionSpeech,
  shortProjectName,
  squiggySpeech,
} from "./speech";

const summary = (over: Partial<WorkspaceSummary>): WorkspaceSummary => ({
  projects: 1,
  active: 0,
  resolved: 0,
  busiestFolder: null,
  ...over,
});

describe("squiggySpeech", () => {
  it("names the busiest folder and the total while comments wait", () => {
    const busiestFolder = { id: "a", name: "A", active: 3 };
    expect(squiggySpeech(summary({ active: 5, busiestFolder }))).toEqual({
      kind: "waiting",
      folder: busiestFolder,
      total: 5,
    });
  });

  it("praises an all-resolved workspace, and says nothing when there's nothing specific", () => {
    expect(squiggySpeech(summary({ resolved: 1 }))).toEqual({ kind: "resolved" });
    expect(squiggySpeech(summary({}))).toBeNull();
    expect(squiggySpeech(summary({ projects: 0 }))).toBeNull();
  });
});

describe("reactionSpeech", () => {
  it("has a line for each event, with the new project's name", () => {
    expect(reactionSpeech({ type: "comment-resolved" })).toEqual({ kind: "just-resolved" });
    expect(reactionSpeech({ type: "project-created", projectName: "Homepage" })).toEqual({
      kind: "just-created",
      projectName: "Homepage",
    });
    expect(reactionSpeech({ type: "save-failed" })).toEqual({ kind: "save-failed" });
  });

  it("mentions Undo only for deletes that have one", () => {
    expect(reactionSpeech({ type: "item-deleted", item: "project" })).toEqual({
      kind: "just-deleted",
      undoable: true,
    });
    expect(reactionSpeech({ type: "item-deleted", item: "comment" })).toEqual({
      kind: "just-deleted",
      undoable: true,
    });
    expect(reactionSpeech({ type: "item-deleted", item: "folder" })).toEqual({
      kind: "just-deleted",
      undoable: false,
    });
  });
});

describe("currentSpeech", () => {
  const waiting = summary({ active: 1, busiestFolder: { id: "a", name: "A", active: 1 } });

  it("says the reaction's line while it lasts, over the workspace's", () => {
    expect(currentSpeech({ type: "comment-resolved" }, waiting)).toEqual({ kind: "just-resolved" });
    expect(currentSpeech({ type: "save-failed" }, null)).toEqual({ kind: "save-failed" });
  });

  it("falls back to the workspace's line, or nothing", () => {
    expect(currentSpeech(null, waiting)?.kind).toBe("waiting");
    expect(currentSpeech(null, summary({}))).toBeNull();
    expect(currentSpeech(null, null)).toBeNull();
  });
});

describe("shortProjectName", () => {
  it("keeps names up to PROJECT_NAME_MAX characters whole", () => {
    const name = "a".repeat(PROJECT_NAME_MAX);
    expect(shortProjectName(name)).toBe(name);
    expect(shortProjectName("Homepage")).toBe("Homepage");
  });

  it("cuts a longer name at the last space that fits, never mid-word", () => {
    const short = shortProjectName("Landing page for the spring campaign launch");
    expect(short).toBe("Landing page for the spring…");
    expect(short.length).toBeLessThanOrEqual(PROJECT_NAME_MAX);
  });

  it("cuts a single long word where it must", () => {
    const short = shortProjectName("x".repeat(50));
    expect(short).toBe(`${"x".repeat(PROJECT_NAME_MAX - 1)}…`);
  });
});
