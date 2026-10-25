import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingRevocation } from "../store/types";
import { planRevocations } from "./revocations";

const entry = (shareId: string, dueAt: number): PendingRevocation => ({
  shareId,
  ownerKey: "k".repeat(43),
  projectId: `p-${shareId}`,
  dueAt,
});

describe("planRevocations", () => {
  it("splits due entries from waiting ones", () => {
    expect(planRevocations([entry("a", 10), entry("b", 50), entry("c", 30)], 20)).toEqual({
      due: [entry("a", 10)],
      nextAt: 30,
    });
    expect(planRevocations([], 20)).toEqual({ due: [], nextAt: null });
  });
});

describe("revokeNow", () => {
  const done = vi.fn<(shareId: string) => void>();

  beforeEach(() => {
    vi.resetModules();
    done.mockReset();
    vi.doMock("../store/actions", () => ({ revocationDone: done }));
  });
  afterEach(() => vi.unstubAllGlobals());

  async function run(status: number) {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(status === 204 ? null : "{}", { status })),
    );
    const { revokeNow } = await import("./revocations");
    await revokeNow(entry("s1", 0));
  }

  it("forgets the entry once the server revoked it, or no longer had it", async () => {
    await run(204);
    await run(404);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it("keeps it for a later retry when the server fails or can't be reached", async () => {
    await run(500);
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
    const { revokeNow } = await import("./revocations");
    await revokeNow(entry("s2", 0));
    expect(done).not.toHaveBeenCalled();
  });
});
