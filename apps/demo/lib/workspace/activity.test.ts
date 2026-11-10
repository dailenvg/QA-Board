import { describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import type { SharedComment } from "../share/types";
import { clientActivity } from "./activity";
import { addComment, updateComment } from "./comments";
import { createProject, trashProject } from "./projects";
import { attachShare, syncShareLink } from "./share-links";

const HOUR = 3_600_000;

/** Without a crop, so the same comment fits the review link and the workspace. */
type PlainComment = Omit<SharedComment, "crop">;

const comment = (id: string, createdAt: number): PlainComment => ({
  id,
  x: 1,
  y: 1,
  body: `Comment ${id}`,
  author: "Cleo",
  status: "active",
  createdAt,
  updatedAt: createdAt,
});

/** A project of the workspace with a review link, and a way for its clients to comment. */
async function linkedProject(db: Database, workspaceId: string, projectId: string) {
  await createProject(db, workspaceId, URL_PROJECT(projectId), NOW);
  const store = createPostgresStore(db);
  const created = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
  const input = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
  await db.transaction((tx) =>
    attachShare(tx, workspaceId, projectId, input, NOW, TEST_AUTH_SECRET),
  );
  return {
    /** A client posts on the link; returns the row's seq (the pull position past it). */
    clientPosts: async (posted: PlainComment, pending = false) => {
      await store.insertComment(
        created.shareId,
        posted,
        "client",
        pending ? { claim: "claim", cropKey: `crop:${posted.id}:claim` } : undefined,
      );
      const { rows } = await db.query<{ seq: string }>(
        "SELECT seq FROM squint_share_comments WHERE share_id = $1 AND id = $2",
        [created.shareId, posted.id],
      );
      return Number(rows[0]?.seq);
    },
    ownerPushes: (pushed: PlainComment) => store.upsertComment(created.shareId, pushed, "owner"),
    /** The owner pulls everything up to `cursor` and saves the guests' comments, as a pull does. */
    pull: async (cursor: number, ...pulled: PlainComment[]) => {
      for (const entry of pulled) {
        await addComment(db, workspaceId, projectId, entry, null, NOW);
      }
      await syncShareLink(db, workspaceId, projectId, { cursor, lastSyncedAt: NOW });
    },
  };
}

describe("client activity", () => {
  it("counts guests' comments in the workspace, never the members'", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
    await addComment(db, a.workspaceId, "p1", comment("mine", NOW + 5 * HOUR), a.userId, NOW);
    await addComment(db, a.workspaceId, "p1", comment("g1", NOW + HOUR), null, NOW);
    await addComment(db, a.workspaceId, "p1", comment("g2", NOW + 2 * HOUR), null, NOW);
    await updateComment(db, a.workspaceId, "p1", "g2", { status: "resolved" }, NOW);

    // Resolved still counts as the newest client comment, but isn't open.
    const expected = [
      { projectId: "p1", open: 1, latestAt: NOW + 2 * HOUR, waiting: [], cursor: 0 },
    ];
    expect(await clientActivity(db, a.workspaceId)).toEqual(expected);
    // A member whose account is deleted is still no client.
    await db.query("DELETE FROM users WHERE id = $1", [a.userId]);
    expect(await clientActivity(db, a.workspaceId)).toEqual(expected);
  });

  it("counts client comments still on the review link until they're pulled, never twice", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    const link = await linkedProject(db, a.workspaceId, "p1");
    const first = comment("w1", NOW + HOUR);
    const second = comment("w2", NOW + 3 * HOUR);
    const seq = await link.clientPosts(first);
    await link.clientPosts(second);
    // The owner's own rows and posts still being confirmed aren't clients' comments yet.
    await link.ownerPushes(comment("owner-row", NOW + 9 * HOUR));
    await link.clientPosts(comment("half-posted", NOW + 9 * HOUR), true);

    expect(await clientActivity(db, a.workspaceId)).toEqual([
      {
        projectId: "p1",
        open: 2,
        latestAt: NOW + 3 * HOUR,
        waiting: [NOW + 3 * HOUR, NOW + HOUR],
        cursor: 0,
      },
    ]);

    // Another tab saved the first but hasn't moved the cursor yet: it's in the workspace only.
    await addComment(db, a.workspaceId, "p1", first, null, NOW);
    expect(await clientActivity(db, a.workspaceId)).toEqual([
      { projectId: "p1", open: 2, latestAt: NOW + 3 * HOUR, waiting: [NOW + 3 * HOUR], cursor: 0 },
    ]);

    // Pulled up to the first: the cursor stops there, the second still waits.
    await link.pull(seq);
    expect(await clientActivity(db, a.workspaceId)).toEqual([
      {
        projectId: "p1",
        open: 2,
        latestAt: NOW + 3 * HOUR,
        waiting: [NOW + 3 * HOUR],
        cursor: seq,
      },
    ]);

    // Both pulled, and the second resolved since.
    await link.pull(seq + 10, second);
    await updateComment(db, a.workspaceId, "p1", "w2", { status: "resolved" }, NOW);
    expect(await clientActivity(db, a.workspaceId)).toEqual([
      { projectId: "p1", open: 1, latestAt: NOW + 3 * HOUR, waiting: [], cursor: 0 },
    ]);
  });

  it("leaves out projects in the trash and other workspaces", async () => {
    const { db, a, b } = await twoWorkspaces();
    for (const seat of [a, b]) await addFolder(db, seat.workspaceId);
    const kept = await linkedProject(db, a.workspaceId, "p1");
    const trashed = await linkedProject(db, a.workspaceId, "p2");
    const theirs = await linkedProject(db, b.workspaceId, "q1");
    await kept.clientPosts(comment("k1", NOW + HOUR));
    await trashed.clientPosts(comment("t1", NOW + 2 * HOUR));
    await addComment(db, a.workspaceId, "p2", comment("t2", NOW + 2 * HOUR), null, NOW);
    await theirs.clientPosts(comment("q1", NOW + 3 * HOUR));
    await addComment(db, b.workspaceId, "q1", comment("q2", NOW + 3 * HOUR), null, NOW);
    await trashProject(db, a.workspaceId, "p2", NOW);

    expect(await clientActivity(db, a.workspaceId)).toEqual([
      { projectId: "p1", open: 1, latestAt: NOW + HOUR, waiting: [NOW + HOUR], cursor: 0 },
    ]);
    expect((await clientActivity(db, b.workspaceId)).map((entry) => entry.projectId)).toEqual([
      "q1",
    ]);
  });

  it("leaves out what waits on an expired review link, which can't be pulled any more", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    const expiring = await linkedProject(db, a.workspaceId, "p1");
    const lasting = await linkedProject(db, a.workspaceId, "p2");
    await expiring.clientPosts(comment("e1", NOW + HOUR));
    await lasting.clientPosts(comment("l1", NOW + 2 * HOUR));
    // The cron deletes an expired share up to a day later; until then it's still here.
    const expiresAt = NOW + 10 * HOUR;
    await db.query(
      `UPDATE squint_shares SET expires_at = $2
       WHERE id = (SELECT share_id FROM project_share_links WHERE project_id = $1)`,
      ["p1", expiresAt],
    );

    expect(
      (await clientActivity(db, a.workspaceId, expiresAt - 1)).map((entry) => entry.projectId),
    ).toEqual(["p2", "p1"]);
    expect(await clientActivity(db, a.workspaceId, expiresAt)).toEqual([
      { projectId: "p2", open: 1, latestAt: NOW + 2 * HOUR, waiting: [NOW + 2 * HOUR], cursor: 0 },
    ]);
  });

  it("is empty for a workspace no client has commented on", async () => {
    const { db, a } = await twoWorkspaces();
    await addFolder(db, a.workspaceId);
    await linkedProject(db, a.workspaceId, "p1");
    expect(await clientActivity(db, a.workspaceId)).toEqual([]);
  });
});
