import { describe, expect, it } from "vitest";
import type { Comment, CommentStatus, Folder, Project, SquintData } from "../store/types";
import {
  activeReaction,
  reactionMood,
  ambientMood,
  attentionMood,
  BUSY_COMMENTS,
  dwellRemaining,
  AMBIENT_DWELL_MS,
  REACTION_MS,
  resolveMood,
  squiggySummary,
  type WorkspaceSummary,
} from "./mood-engine";

const folder = (id: string, createdAt: number): Folder => ({
  id,
  name: id.toUpperCase(),
  createdAt,
  parentId: null,
});

const project = (id: string, folderId: string): Project => ({
  id,
  folderId,
  name: id,
  source: { kind: "url", url: "https://example.com/" },
  createdAt: 1,
  updatedAt: 1,
});

const comment = (id: string, projectId: string, status: CommentStatus): Comment => ({
  id,
  projectId,
  x: 0,
  y: 0,
  body: "",
  author: "A",
  status,
  createdAt: 1,
  updatedAt: 1,
});

const data = (projects: Project[], comments: Comment[]): SquintData => ({
  version: 3,
  folders: [folder("b", 2), folder("a", 1), folder("c", 3)],
  projects,
  comments,
  snapshots: [],
  revocations: [],
  authorName: null,
});

const summary = (over: Partial<WorkspaceSummary>): WorkspaceSummary => ({
  projects: 1,
  active: 0,
  resolved: 0,
  busiestFolder: null,
  ...over,
});

describe("squiggySummary", () => {
  it("counts projects and comments, and finds the folder with the most active ones", () => {
    const result = squiggySummary(
      data(
        [project("p1", "a"), project("p2", "b"), project("p3", "b")],
        [
          comment("1", "p1", "active"),
          comment("2", "p2", "active"),
          comment("3", "p3", "active"),
          comment("4", "p3", "resolved"),
        ],
      ),
    );
    expect(result).toEqual({
      projects: 3,
      active: 3,
      resolved: 1,
      busiestFolder: { id: "b", name: "B", active: 2 },
    });
  });

  it("gives a tie to the older folder and ignores comments of missing projects", () => {
    const result = squiggySummary(
      data(
        [project("p1", "b"), project("p2", "a")],
        [
          comment("1", "p1", "active"),
          comment("2", "p2", "active"),
          comment("3", "gone", "active"),
        ],
      ),
    );
    expect(result.active).toBe(2);
    expect(result.busiestFolder?.id).toBe("a");
  });

  it("has no busiest folder when nothing is active", () => {
    const result = squiggySummary(data([project("p1", "a")], [comment("1", "p1", "resolved")]));
    expect(result.busiestFolder).toBeNull();
  });
});

describe("ambientMood", () => {
  it("sleeps in an empty workspace until the first input, then idles", () => {
    expect(ambientMood(summary({ projects: 0 }), false)).toBe("sleeping");
    expect(ambientMood(summary({ projects: 0 }), true)).toBe("idle");
  });

  it("thinks while comments are active, and is surprised from BUSY_COMMENTS on", () => {
    expect(ambientMood(summary({ active: 1 }), true)).toBe("thinking");
    expect(ambientMood(summary({ active: BUSY_COMMENTS - 1 }), true)).toBe("thinking");
    expect(ambientMood(summary({ active: BUSY_COMMENTS }), true)).toBe("surprised");
  });

  it("is happy once everything is resolved, and idles with only fresh projects", () => {
    expect(ambientMood(summary({ resolved: 2 }), true)).toBe("happy");
    expect(ambientMood(summary({ active: 1, resolved: 2 }), true)).toBe("thinking");
    expect(ambientMood(summary({}), false)).toBe("idle");
  });
});

describe("resolveMood", () => {
  const base = { reaction: null, attention: null, ambient: "thinking", asleep: false } as const;

  it("shows the ambient mood when nothing else is going on", () => {
    expect(resolveMood(base)).toBe("thinking");
  });

  it("sleeps after a long quiet, over the ambient mood", () => {
    expect(resolveMood({ ...base, asleep: true })).toBe("sleeping");
  });

  it("lets attention beat sleep and ambient, and a reaction beat everything", () => {
    expect(resolveMood({ ...base, asleep: true, attention: "listening" })).toBe("listening");
    expect(resolveMood({ ...base, attention: "listening", reaction: "resolved" })).toBe("resolved");
    expect(resolveMood({ ...base, asleep: true, reaction: "surprised" })).toBe("surprised");
  });
});

describe("attentionMood", () => {
  it("winks happily on a poke, listens for New project, else stays out of the way", () => {
    expect(attentionMood({ poked: true, listening: true })).toBe("happy");
    expect(attentionMood({ poked: false, listening: true })).toBe("listening");
    expect(attentionMood({ poked: false, listening: false })).toBeNull();
  });
});

describe("activeReaction", () => {
  const resolved = { type: "comment-resolved" } as const;

  it("keeps the event for REACTION_MS from when it happened", () => {
    expect(activeReaction({ event: resolved, at: 1000 }, 1000)).toEqual({
      event: resolved,
      remaining: REACTION_MS,
    });
    // Mounted late: only what's left of the window, never a fresh one.
    expect(activeReaction({ event: resolved, at: 1000 }, 3000)?.remaining).toBe(REACTION_MS - 2000);
  });

  it("ends once REACTION_MS have passed", () => {
    expect(activeReaction({ event: resolved, at: 0 }, REACTION_MS)).toBeNull();
    expect(activeReaction(null, 0)).toBeNull();
  });
});

describe("reactionMood", () => {
  it("maps each event to its mood", () => {
    expect(reactionMood({ type: "comment-resolved" })).toBe("resolved");
    expect(reactionMood({ type: "project-created", projectName: "Site" })).toBe("happy");
    expect(reactionMood({ type: "item-deleted", item: "comment" })).toBe("surprised");
    expect(reactionMood({ type: "save-failed" })).toBe("surprised");
  });
});

describe("dwellRemaining", () => {
  it("holds a mood for AMBIENT_DWELL_MS", () => {
    expect(dwellRemaining(1000, 1000)).toBe(AMBIENT_DWELL_MS);
    expect(dwellRemaining(1000, 1000 + AMBIENT_DWELL_MS + 1)).toBe(0);
  });
});
