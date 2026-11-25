import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COMMENT, RECORD, REPLY, REPLY_CAPS } from "@/test/share-fixture";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { migrate } from "./migrate";
import { createPostgresStore } from "./postgres-store";
import type { ShareStore } from "./store";

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * A reply going in while its comment is deleted (R1), which PGlite can't run
 * (it has one connection): set TEST_DATABASE_URL to a throwaway local
 * Postgres. The delete holds the comment's row until it commits, so the
 * reply's statement sees the comment, then its foreign key finds it gone.
 */
describe.skipIf(!TEST_DATABASE_URL)("a reply and its comment's delete on Postgres", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;
  let store: ShareStore;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string, 4);
    await migrate(fresh.db);
    store = createPostgresStore(fresh.db);
  });

  afterAll(async () => {
    await fresh.close();
  });

  /** A new share with `COMMENT`, and a connection deleting it, not yet committed. */
  async function deleting(shareId: string) {
    await store.create({ ...RECORD, id: shareId, tokenHash: shareId.padEnd(64, "0") });
    await store.upsertComment(shareId, COMMENT, "owner");
    const client = await fresh.pool.connect();
    await client.query("BEGIN");
    await client.query("DELETE FROM squint_share_comments WHERE share_id = $1 AND id = $2", [
      shareId,
      COMMENT.id,
    ]);
    return {
      async commit() {
        await pause(100);
        await client.query("COMMIT");
        client.release();
      },
    };
  }

  it("leaves a guest's reply missing (a 404), never a storage error", async () => {
    const race = await deleting("race-guest");
    const [added] = await Promise.all([
      store.addClientReply("race-guest", REPLY, REPLY_CAPS),
      race.commit(),
    ]);
    expect(added).toBe("missing");
    expect(await store.replies("race-guest")).toEqual([]);
  });

  it("drops the owner's pushed reply quietly", async () => {
    const race = await deleting("race-owner");
    const [pushed] = await Promise.all([store.upsertReply("race-owner", REPLY), race.commit()]);
    expect(pushed).toBeUndefined();
    expect(await store.replies("race-owner")).toEqual([]);
  });
});
