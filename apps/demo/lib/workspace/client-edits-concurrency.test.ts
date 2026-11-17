import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STATE } from "@/test/share-fixture";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { addFolder, NOW, seat, TEST_AUTH_SECRET, URL_PROJECT } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { migrate } from "../share/migrate";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { addClientComment, createShare, editClientComment, ownerShare } from "../share/service";
import { hashSecret } from "../share/tokens";
import type { ShareRecord } from "../share/types";
import { addComment, changeComment } from "./comments";
import { createProject } from "./projects";
import { attachShare, findGuestComment } from "./share-links";

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * A client's edit racing the team's resolve of the same comment (4.12), which
 * PGlite can't run (it has one connection): set TEST_DATABASE_URL to a
 * throwaway local Postgres. Each run migrates a schema of its own and drops it.
 */
describe.skipIf(!TEST_DATABASE_URL)(
  "a client's edit and a resolve on Postgres, in parallel",
  () => {
    let fresh: Awaited<ReturnType<typeof freshSchema>>;
    let db: Database;

    beforeAll(async () => {
      fresh = await freshSchema(TEST_DATABASE_URL as string, 8);
      db = fresh.db;
      await migrate(db);
    });

    afterAll(async () => {
      await fresh.close();
    });

    /** Project p1 of a new workspace, shared, with a guest's comment pulled into it. */
    async function sharedComment(slug: string) {
      const owner = await seat(db, slug);
      await addFolder(db, owner.workspaceId);
      await createProject(db, owner.workspaceId, URL_PROJECT(`${slug}-p1`), NOW);
      const projectId = `${slug}-p1`;
      const services: ShareServices = { store: createPostgresStore(db), blobs: inlineBackend };
      const created = await createShare(services, STATE, Date.now());
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
      const share = (await ownerShare(
        services.store,
        shareId,
        ownerKey,
        Date.now(),
      )) as ShareRecord;
      const posted = { id: "guest-1", x: 1, y: 1, body: "First words", author: "Cleo" };
      const added = await addClientComment(services, share, posted, null, Date.now());
      if (!added.ok) throw new Error(added.error);
      const guest = await findGuestComment(db, owner.workspaceId, projectId, "guest-1");
      const sent = { ...posted, status: "active" as const };
      await addComment(db, owner.workspaceId, projectId, sent, null, Date.now(), guest);
      return { owner, projectId, services, share, key: added.value.editKey };
    }

    /** The guest's comment as the link holds it. */
    async function onLink(services: ShareServices, share: ShareRecord) {
      const rows = await services.store.comments(share.id);
      return rows.find((row) => row.item.id === "guest-1")?.item;
    }

    it("lets exactly one order win: an edit before the resolve stands, one after it is locked", async () => {
      const { owner, projectId, services, share, key } = await sharedComment("race-edit");
      const actor = { userId: owner.userId };
      const outcomes = new Set<string>();
      for (let round = 0; round < 20; round += 1) {
        const reopened = await changeComment(
          db,
          owner.workspaceId,
          projectId,
          "guest-1",
          { status: "active" },
          Date.now(),
          actor,
        );
        expect(reopened?.status).toBe("active");
        const before = await onLink(services, share);
        const words = `Round ${round}`;
        const [edited, resolved] = await Promise.all([
          editClientComment(services, share, "guest-1", key, words, Date.now()),
          changeComment(
            db,
            owner.workspaceId,
            projectId,
            "guest-1",
            { status: "resolved" },
            Date.now(),
            actor,
          ),
        ]);
        expect(resolved?.status).toBe("resolved");
        const after = await onLink(services, share);
        // Resolved on the link either way: the edit never undoes the lock.
        expect(after?.status).toBe("resolved");
        if (edited.ok) {
          // The edit came first, while active: the comment is resolved with the new words.
          expect(after?.body).toBe(words);
          outcomes.add("edit first");
        } else {
          // The resolve came first: the edit changed nothing.
          expect(edited).toEqual({ ok: false, status: 409, error: "locked" });
          expect(after?.body).toBe(before?.body);
          outcomes.add("resolve first");
        }
      }
      expect(outcomes.size).toBeGreaterThan(0);
    });

    it("makes an edit wait for a resolve holding the row, then answers locked", async () => {
      const { services, share, key } = await sharedComment("race-resolve-first");
      let settled = false;
      // Wrapped, so the transaction doesn't wait for the edit it holds up.
      const { edit } = await db.transaction(async (tx) => {
        await createPostgresStore(tx).setClientCommentStatus(share.id, "guest-1", {
          status: "resolved",
          resolvedAt: NOW,
          updatedAt: NOW,
        });
        const waiting = editClientComment(services, share, "guest-1", key, "Too late", Date.now());
        void waiting.then(() => (settled = true));
        await pause(300);
        // Still waiting on the row the resolve holds.
        expect(settled).toBe(false);
        return { edit: waiting };
      });
      expect(await edit).toEqual({ ok: false, status: 409, error: "locked" });
      expect(await onLink(services, share)).toMatchObject({
        body: "First words",
        status: "resolved",
      });
    });

    it("makes a resolve wait for an edit holding the row, then resolves the new words", async () => {
      const { owner, projectId, services, share, key } = await sharedComment("race-edit-first");
      let settled = false;
      const { resolve } = await db.transaction(async (tx) => {
        const held = createPostgresStore(tx);
        const edited = await held.editClientComment(
          share.id,
          "guest-1",
          hashSecret(key),
          "Just in time",
          Date.now(),
        );
        expect(edited).toMatchObject({ body: "Just in time" });
        const waiting = changeComment(
          db,
          owner.workspaceId,
          projectId,
          "guest-1",
          { status: "resolved" },
          Date.now(),
          { userId: owner.userId },
        );
        void waiting.then(() => (settled = true));
        await pause(300);
        expect(settled).toBe(false);
        return { resolve: waiting };
      });
      expect((await resolve)?.status).toBe("resolved");
      expect(await onLink(services, share)).toMatchObject({
        body: "Just in time",
        status: "resolved",
      });
    });
  },
);
