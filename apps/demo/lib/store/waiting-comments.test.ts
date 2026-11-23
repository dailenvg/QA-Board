import { describe, expect, it } from "vitest";
import type { ClientCommentActivity } from "../workspace/types";
import { folderSummaries, summarize } from "./selectors";
import type { Comment, Project, SquintData } from "./types";
import { NO_WAITING, waitingComments, waitingCounts, withWaiting } from "./waiting-comments";

const project = (id: string, cursor?: number): Project => ({
  id,
  folderId: "f",
  name: `Project ${id}`,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: 1,
  updatedAt: 1,
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

const comment = (id: string, projectId: string, extra: Partial<Comment> = {}): Comment => ({
  id,
  projectId,
  x: 1,
  y: 1,
  body: `Body ${id}`,
  author: "Ana",
  status: "active",
  createdAt: 100,
  updatedAt: 100,
  ...extra,
});

const data = (projects: Project[], comments: Comment[] = []): SquintData => ({
  version: 3,
  folders: [{ id: "f", name: "Folder", createdAt: 1, parentId: null }],
  projects,
  comments,
  snapshots: [],
  replies: [],
  authorName: "Ana",
});

const entry = (projectId: string, waiting: number[], cursor = 4): ClientCommentActivity => ({
  projectId,
  open: waiting.length,
  latestAt: Math.max(0, ...waiting),
  waiting,
  cursor,
});

describe("waiting comments", () => {
  it("counts each project's comments still on its review link", () => {
    const workspace = data([project("a", 4), project("b", 4), project("c", 4)]);
    const activity = [entry("a", [300, 200]), entry("b", []), entry("gone", [500])];
    expect(waitingCounts(workspace, activity)).toEqual(new Map([["a", 2]]));
  });

  it("drops a project pulled since the server's read: its cursor moved past the read's", () => {
    const workspace = data([project("a", 9), project("b", 4)]);
    const activity = [entry("a", [300], 4), entry("b", [200], 4)];
    expect(waitingCounts(workspace, activity)).toEqual(new Map([["b", 1]]));
  });

  it("drops a comment a pull brought in while its cursor was held back", () => {
    const workspace = data(
      [project("a", 4)],
      [comment("pulled", "a", { createdAt: 300, fromClient: true }), comment("team", "a")],
    );
    expect(waitingComments(workspace, [entry("a", [300, 200])])).toEqual(new Map([["a", [200]]]));
    // A team comment posted at the same moment isn't a client's: it takes nothing away.
    const team = data([project("a", 4)], [comment("team", "a", { createdAt: 200 })]);
    expect(waitingCounts(team, [entry("a", [200])])).toEqual(new Map([["a", 1]]));
  });

  it("adds waiting comments to a card's open count, making its status Comments in", () => {
    expect(withWaiting({ active: 1, resolved: 2 }, 3)).toEqual({ active: 4, resolved: 2 });
    const counts = { active: 0, resolved: 1 };
    expect(withWaiting(counts, 0)).toBe(counts);

    const workspace = data(
      [project("a", 4), project("b")],
      [comment("done", "a", { status: "resolved" })],
    );
    const waiting = waitingCounts(workspace, [entry("a", [300, 200])]);
    const a = workspace.projects[0]!;
    expect(summarize(workspace, a, waiting)).toMatchObject({
      counts: { active: 2, resolved: 1 },
      status: "comments",
    });
    expect(summarize(workspace, a)).toMatchObject({ status: "resolved" });
    expect(folderSummaries(workspace, "f", waiting).map((card) => card.counts.active)).toEqual([
      2, 0,
    ]);
    expect(folderSummaries(workspace, "f", NO_WAITING)[0]?.counts.active).toBe(0);
  });
});
