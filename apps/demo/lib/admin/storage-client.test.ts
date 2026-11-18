import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOrphanCheck, requestSweep } from "./storage-client";

function answer(status: number, body: unknown = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

const REPORT = {
  checkedAt: 1,
  complete: true,
  shareFiles: null,
  workspaceRows: { files: 0, bytes: 0 },
  unrecordedFiles: null,
};

describe("the Storage page's client", () => {
  it("asks for the check and the sweep with an empty JSON POST, uncached", async () => {
    const fetch = answer(200, { report: REPORT });
    expect(await requestOrphanCheck()).toEqual({ ok: true, value: REPORT });
    fetch.mockResolvedValue(Response.json({ report: { done: true, failed: {} } }));
    expect(await requestSweep()).toEqual({ ok: true, value: { done: true, failed: {} } });
    expect(
      fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body, init?.cache]),
    ).toEqual([
      ["/api/admin/storage/orphans", "POST", "{}", "no-store"],
      ["/api/admin/sweep", "POST", "{}", "no-store"],
    ]);
  });

  it("says what went wrong, by the answer", async () => {
    const cases: Array<[number, unknown, string]> = [
      [409, { error: "running" }, "running"],
      [409, { error: "other" }, "failed"],
      [401, {}, "signed-out"],
      [404, {}, "not-found"],
      [500, { error: "storage" }, "failed"],
      [200, { nothing: true }, "failed"],
    ];
    for (const [status, body, error] of cases) {
      answer(status, body);
      expect(await requestSweep()).toEqual({ ok: false, error });
    }
  });

  it("says offline when the request never reached Squint", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    expect(await requestOrphanCheck()).toEqual({ ok: false, error: "offline" });
  });
});
