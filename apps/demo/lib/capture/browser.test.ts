import { afterEach, describe, expect, it, vi } from "vitest";
import { browserTurn } from "./browser";

/** Whether `promise` settles within a few ticks. */
async function settles(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => (settled = true));
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  return settled;
}

describe("browserTurn", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("makes serverless captures take turns", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    const endFirst = await browserTurn();
    const second = browserTurn();
    expect(await settles(second)).toBe(false);
    endFirst();
    expect(await settles(second)).toBe(true);
    (await second)();
  });

  it("lets local captures run side by side", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    await browserTurn();
    expect(await settles(browserTurn())).toBe(true);
  });
});
