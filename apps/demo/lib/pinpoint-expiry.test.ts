import { PGlite } from "@electric-sql/pglite";
import type { PinDraft } from "@pinpoint/server";
import { createPostgresStorage, migrate, type Queryable } from "@pinpoint/server/postgres";
import { describe, expect, it } from "vitest";

/**
 * PGlite as the `pg` slice pinpoint uses: the real SQL, no server. Like `pg`,
 * parameterless queries use the simple protocol (several statements allowed).
 */
function adapt(db: PGlite): Queryable {
  const query = async (text: string, values?: unknown[]) => {
    const result = values?.length
      ? await db.query(text, values)
      : ((await db.exec(text)).at(-1) ?? { rows: [], affectedRows: 0 });
    return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
  };
  return { query } as unknown as Queryable;
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 27);
const CUTOFF = NOW - 30 * DAY;

const draft = (id: string, createdAt: number): PinDraft => ({
  id,
  path: "/pricing",
  branch: "feature/x",
  deploymentUrl: "https://preview.example",
  deepLink: `https://preview.example/pricing?pin=${id}`,
  anchor: { selector: "#cta", xPct: 50, yPct: 50, viewportXPct: 40, viewportYPct: 20 },
  author: "Ana",
  body: "Make the CTA larger",
  priority: null,
  context: { viewport: { width: 1280, height: 800 }, userAgent: "vitest" },
  replies: [],
  resolved: false,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: new Date(createdAt).toISOString(),
  screenshot: null,
});

describe("pinpoint pins in Postgres", () => {
  it("expire 30 days after creation, to the millisecond, with their replies", async () => {
    const db = adapt(new PGlite());
    expect(await migrate(db)).toEqual(["001_init", "002_pins_created_at"]);
    const storage = createPostgresStorage({ pool: db });
    await storage.createPin(draft("old", CUTOFF - DAY));
    await storage.createPin(draft("edge", CUTOFF));
    await storage.createPin(draft("new", CUTOFF + 1));
    const reply = { id: "r1", author: "Bo", body: "On it", createdAt: new Date(NOW).toISOString() };
    await storage.addReply({ branch: "feature/x", pinId: "old", reply });

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 2, done: true });

    const left = await storage.listPins({ branch: "feature/x", path: "/pricing" });
    expect(left.map((pin) => pin.id)).toEqual(["new"]);
    const { rows } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pinpoint_replies",
    );
    expect(rows[0]?.count).toBe(0);
    expect(await migrate(db)).toEqual([]);
  });
});
