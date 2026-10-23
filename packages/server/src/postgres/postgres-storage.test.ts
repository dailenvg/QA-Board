import type { QueryResult, QueryResultRow } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { draft, pin, PNG_BYTES } from "../../test/fixtures";
import { createMemoryStorage } from "../storage/memory-storage";
import { PinNotFoundError, type StorageAdapter } from "../storage";
import { createPostgresStorage, type Queryable } from "./postgres-storage";
import type { PinRow } from "./rows";

const scope = { branch: "feature/x", path: "/pricing" };
const reply = { id: "r1", author: "Bo", body: "On it", createdAt: "2026-10-23T11:00:00.000Z" };

function result<R extends QueryResultRow>(rows: R[], rowCount = rows.length): QueryResult<R> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}

function row(overrides: Partial<PinRow> = {}): PinRow {
  const source = pin();
  return {
    id: source.id,
    branch: "feature/x",
    path: source.path,
    deployment_url: source.deploymentUrl,
    deep_link: source.deepLink,
    anchor: source.anchor,
    author: source.author,
    body: source.body,
    priority: source.priority,
    screenshot_url: null,
    context: source.context,
    resolved: false,
    resolved_at: null,
    resolved_by: null,
    created_at: new Date(source.createdAt),
    replies: [],
    ...overrides,
  };
}

function mockPool(respond: (text: string, values: unknown[]) => QueryResult<QueryResultRow>) {
  const query = vi.fn((text: string, values: unknown[] = []) =>
    Promise.resolve(respond(text, values)),
  );
  return { pool: { query } as unknown as Queryable, query };
}

function sqlOf(query: ReturnType<typeof mockPool>["query"], index: number): string {
  return (query.mock.calls[index]?.[0] ?? "").replace(/\s+/g, " ");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("createPostgresStorage", () => {
  it("lists pins with one parameterised, branch+path scoped query", async () => {
    const { pool, query } = mockPool(() =>
      result([row({ replies: [{ ...reply, createdAt: "2026-10-23T11:00:00+00:00" }] })]),
    );
    const pins = await createPostgresStorage({ pool }).listPins(scope);

    expect(query).toHaveBeenCalledOnce();
    expect(sqlOf(query, 0)).toContain("WHERE p.branch = $1 AND p.path = $2");
    expect(sqlOf(query, 0)).toContain("LEFT JOIN pinpoint_replies");
    expect(query.mock.calls[0]?.[1]).toEqual(["feature/x", "/pricing"]);
    expect(pins).toEqual([{ ...pin(), replies: [reply] }]);
  });

  it("inserts new pins with values passed as parameters, never interpolated", async () => {
    const { pool, query } = mockPool(() => result([], 1));
    const hostile = draft({ body: "'); DROP TABLE pinpoint_pins; --" });

    const created = await createPostgresStorage({ pool }).createPin(hostile);

    const sql = sqlOf(query, 0);
    expect(sql).toMatch(/^INSERT INTO pinpoint_pins/);
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).toContain("$6::jsonb");
    const values = query.mock.calls[0]?.[1] ?? [];
    expect(values).toHaveLength(12);
    expect(values).toContain(hostile.body);
    expect(values[5]).toBe(JSON.stringify(hostile.anchor));
    expect(created).toMatchObject({ id: "pin-1", screenshotUrl: null });
  });

  it("adds a reply scoped to the branch, then returns the fresh pin", async () => {
    const { pool, query } = mockPool((text) =>
      text.startsWith("INSERT") ? result([], 1) : result([row({ replies: [reply] })]),
    );

    const updated = await createPostgresStorage({ pool }).addReply({
      ...scope,
      pinId: "pin-1",
      reply,
    });

    expect(sqlOf(query, 0)).toContain("INSERT INTO pinpoint_replies");
    expect(sqlOf(query, 0)).toContain("WHERE p.id = $2 AND p.branch = $6");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "r1",
      "pin-1",
      "Bo",
      "On it",
      reply.createdAt,
      "feature/x",
    ]);
    expect(sqlOf(query, 1)).toContain("WHERE p.branch = $1 AND p.id = $2");
    expect(updated.replies).toEqual([reply]);
  });

  it("throws PinNotFoundError when no row matches", async () => {
    const { pool } = mockPool(() => result([], 0));
    const storage = createPostgresStorage({ pool });
    await expect(storage.addReply({ ...scope, pinId: "x", reply })).rejects.toBeInstanceOf(
      PinNotFoundError,
    );
    await expect(
      storage.resolvePin({ ...scope, pinId: "x", resolvedBy: "Bo", resolvedAt: reply.createdAt }),
    ).rejects.toBeInstanceOf(PinNotFoundError);
  });

  it("resolves idempotently with COALESCE", async () => {
    const { pool, query } = mockPool((text) =>
      text.startsWith("UPDATE")
        ? result([], 1)
        : result([
            row({ resolved: true, resolved_by: "Bo", resolved_at: new Date(reply.createdAt) }),
          ]),
    );
    const resolved = await createPostgresStorage({ pool }).resolvePin({
      ...scope,
      pinId: "pin-1",
      resolvedBy: "Bo",
      resolvedAt: reply.createdAt,
    });
    expect(sqlOf(query, 0)).toContain("resolved_at = COALESCE(resolved_at, $3)");
    expect(resolved).toMatchObject({
      resolved: true,
      resolvedBy: "Bo",
      resolvedAt: reply.createdAt,
    });
  });

  it("requires a pool or connection string", () => {
    expect(() => createPostgresStorage({})).toThrow(/pool/);
  });

  describe("mirror", () => {
    function mirrored(mirror: StorageAdapter) {
      const { pool, query } = mockPool((text) =>
        text.startsWith("SELECT") ? result([row({ replies: [reply] })]) : result([], 1),
      );
      return { storage: createPostgresStorage({ pool, mirror }), query };
    }

    it("sends every write to the mirror with the same ids", async () => {
      const mirror = createMemoryStorage();
      const { storage } = mirrored(mirror);

      await storage.createPin(draft());
      await storage.addReply({ ...scope, pinId: "pin-1", reply });
      await storage.resolvePin({
        ...scope,
        pinId: "pin-1",
        resolvedBy: "Bo",
        resolvedAt: reply.createdAt,
      });

      const [copy] = await mirror.listPins(scope);
      expect(copy).toMatchObject({ id: "pin-1", resolved: true, replies: [reply] });
    });

    it("adopts the mirror's screenshot URL when it has no store of its own", async () => {
      const mirror = createMemoryStorage({
        screenshots: { save: () => Promise.resolve("https://cdn/x.png") },
      });
      const { storage, query } = mirrored(mirror);

      const created = await storage.createPin(
        draft({ screenshot: { contentType: "image/png", data: PNG_BYTES } }),
      );

      expect(created.screenshotUrl).toBe("https://cdn/x.png");
      expect(sqlOf(query, 1)).toContain("SET screenshot_url = $2");
      expect(query.mock.calls[1]?.[1]).toEqual(["pin-1", "https://cdn/x.png"]);
    });

    it("logs mirror failures without failing the request", async () => {
      const failing: StorageAdapter = {
        listPins: () => Promise.reject(new Error("down")),
        createPin: () => Promise.reject(new Error("down")),
        addReply: () => Promise.reject(new Error("down")),
        resolvePin: () => Promise.reject(new Error("down")),
      };
      const { storage } = mirrored(failing);

      await expect(storage.createPin(draft())).resolves.toMatchObject({ id: "pin-1" });
      await expect(storage.addReply({ ...scope, pinId: "pin-1", reply })).resolves.toBeDefined();
      expect(console.error).toHaveBeenCalledTimes(2);
    });
  });
});
