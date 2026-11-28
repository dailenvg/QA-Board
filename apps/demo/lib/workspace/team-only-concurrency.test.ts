import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { addFolder, NOW, PNG, seat, TEST_AUTH_SECRET, URL_PROJECT } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { migrate } from "../share/migrate";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { lockShare } from "../share/share-lock";
import { applyChanges, createShare, readBlob } from "../share/service";
import type { ShareChange, SharedComment, SharedReply } from "../share/types";
import { addComment, setCommentTeamOnly } from "./comments";
import { addReply } from "./replies";
import { createProject } from "./projects";
import { attachShare } from "./share-links";

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Team-only changes racing pushes and guests' replies on the same link
 * (D10, D41), which PGlite can't run (it has one connection): set
 * TEST_DATABASE_URL to a throwaway local Postgres.
 */
describe.skipIf(!TEST_DATABASE_URL)("team-only changes on Postgres, in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;
  let db: Database;
  let services: ShareServices;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 8);
    db = fresh.db;
    await migrate(db);
    services = { store: createPostgresStore(db), blobs: inlineBackend };
  });

  afterAll(async () => {
    await fresh.close();
  });

  const shared = (id: string, extra: Partial<SharedComment> = {}): SharedComment => ({
    id,
    x: 1,
    y: 1,
    body: "Hi",
    author: "Dailen",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  });
  const sharedReply = (id: string, commentId: string): SharedReply => ({
    id,
    commentId,
    body: "Yes",
    author: "Cleo",
    createdAt: NOW,
  });
  const push = (extra: Partial<ShareChange>): ShareChange => ({
    snapshots: [],
    comments: [],
    replies: [],
    deleteSnapshots: [],
    deleteComments: [],
    deleteReplies: [],
    cursor: 0,
    ...extra,
  });

  /** A shared project of a new workspace with the owner's comments `ids`, each on the link with a crop. */
  async function linked(slug: string, ids: readonly string[]) {
    const owner = await seat(db, slug);
    await addFolder(db, owner.workspaceId);
    const projectId = `${slug}-p1`;
    await createProject(db, owner.workspaceId, URL_PROJECT(projectId), NOW);
    const created = await createShare(services, { ...STATE, comments: [], replies: [] }, NOW);
    const { shareId, token, ownerKey } = created;
    await db.transaction((tx) =>
      attachShare(
        tx,
        owner.workspaceId,
        projectId,
        { shareId, token, ownerKey },
        NOW,
        TEST_AUTH_SECRET,
      ),
    );
    const crop = { rect: { x: 0, y: 0, width: 4, height: 4 } };
    for (const id of ids) {
      const body = { id, x: 1, y: 1, body: "Hi", author: "Dailen", status: "active" as const };
      await addComment(db, owner.workspaceId, projectId, body, owner.userId, NOW);
      await services.store.upsertComment(shareId, shared(id, { crop }), "owner");
      await services.store.putBlob(shareId, {
        key: `crop:${id}`,
        contentType: "image/png",
        size: PNG.length,
        location: { kind: "inline", bytes: PNG },
      });
    }
    const share = await services.store.byId(shareId);
    if (!share) throw new Error("no share");
    const actor = { userId: owner.userId, canModerate: true };
    const hide = (id: string) =>
      setCommentTeamOnly(db, { workspaceId: owner.workspaceId, projectId, id }, true, NOW, actor);
    const onLink = async () => (await services.store.comments(shareId)).map((row) => row.item.id);
    return { share, shareId, hide, onLink, owner, projectId };
  }

  /** Resolves once `count` transactions wait for an advisory lock. */
  async function waitingForLock(count: number) {
    for (;;) {
      const { rows } = await db.query<{ waiting: number }>(
        "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
      );
      if ((rows[0]?.waiting ?? 0) >= count) return;
      await pause(10);
    }
  }

  /**
   * Holds the share's lock on a connection of its own, so the push and the
   * change queue behind it in `first`'s order, then lets them go.
   */
  async function inOrder(
    shareId: string,
    first: () => Promise<unknown>,
    second: () => Promise<unknown>,
  ) {
    const barrier = await fresh.pool.connect();
    await barrier.query("BEGIN");
    await lockShare(barrier, shareId);
    const one = first();
    await waitingForLock(1);
    const two = second();
    await waitingForLock(2);
    await barrier.query("COMMIT");
    barrier.release();
    return Promise.all([one, two]);
  }

  it("never leaves the comment on the link, whether a stale push runs before or after the change", async () => {
    for (const pushFirst of [true, false]) {
      const slug = pushFirst ? "push-first" : "change-first";
      const { share, shareId, hide, onLink } = await linked(slug, ["c1"]);
      // The push a stale tab built while c1 was still for clients.
      const stale = () => applyChanges(services, share, push({ comments: [shared("c1")] }), NOW);
      const change = () => hide("c1");
      const [a, b] = pushFirst
        ? await inOrder(shareId, stale, change)
        : await inOrder(shareId, change, stale);
      expect([a, b]).toEqual(expect.arrayContaining([expect.objectContaining({ ok: true })]));
      expect(await onLink(), slug).toEqual([]);
      expect(await readBlob(services, share, "crop:c1"), slug).toBeNull();
    }
  });

  it("lets either the change (409) or a guest's reply (404) win, never both", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `c${index}`);
    const { shareId, hide } = await linked("reply-race", ids);
    const caps = { link: 100, comment: 100 };
    for (const id of ids) {
      const [hidden, replied] = await Promise.all([
        hide(id),
        services.store.addClientReply(shareId, sharedReply(`${id}-k`, id), caps),
      ]);
      const outcome = hidden.ok ? ["hidden", replied] : [hidden.reason, replied];
      expect([
        ["hidden", "missing"],
        ["has-client-replies", "added"],
      ]).toContainEqual(outcome);
    }
  });

  it("commits the rest of a push when a reply's comment goes as it's written (I1)", async () => {
    const { share, shareId, onLink } = await linked("orphan", ["c1"]);
    const deleting = await fresh.pool.connect();
    await deleting.query("BEGIN");
    await deleting.query("DELETE FROM squint_share_comments WHERE share_id = $1 AND id = 'c1'", [
      shareId,
    ]);
    const pushed = applyChanges(
      services,
      share,
      push({ comments: [shared("c2")], replies: [sharedReply("r1", "c1")] }),
      NOW,
    );
    await pause(150);
    await deleting.query("COMMIT");
    deleting.release();
    expect(await pushed).toMatchObject({ ok: true });
    expect(await onLink()).toEqual(["c2"]);
    expect(await services.store.replies(shareId)).toEqual([]);
  });

  it("stores a team reply racing the change as team only once it commits (the comment row's lock)", async () => {
    const { owner, projectId } = await linked("reply-flip", ["c1"]);
    const changing = await fresh.pool.connect();
    await changing.query("BEGIN");
    await changing.query(
      "UPDATE comments SET team_only = true WHERE project_id = $1 AND id = 'c1'",
      [projectId],
    );
    const reply = addReply(
      db,
      owner.workspaceId,
      projectId,
      "c1",
      { id: "r1", body: "Yes", author: "Dailen" },
      { kind: "team", userId: owner.userId },
      NOW,
    );
    await pause(150);
    await changing.query("COMMIT");
    changing.release();
    expect(await reply).toMatchObject({ ok: true, value: { id: "r1", teamOnly: true } });
  });
});
