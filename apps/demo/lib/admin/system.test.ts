import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { twoWorkspaces } from "@/test/workspace-fixture";
import { CRON_SCHEDULE } from "../cron/schedule";
import { CRON_RUNS_SHOWN, loadAdminSystem } from "./system";

describe("the System page", () => {
  it("states the cleanup's schedule as vercel.json sets it", () => {
    const config = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../../../vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons).toEqual([{ path: "/api/cron/expire", schedule: CRON_SCHEDULE }]);
  });

  it("reads the services, the latest runs and the rate limits", async () => {
    const { db } = await twoWorkspaces();
    const now = Date.UTC(2026, 10, 18, 4);
    for (let index = 0; index < CRON_RUNS_SHOWN + 3; index += 1) {
      await db.query("INSERT INTO cron_runs (trigger, started_at) VALUES ('schedule', $1)", [
        new Date(now - (index + 1) * 24 * 60 * 60 * 1000),
      ]);
    }
    const system = await loadAdminSystem(db, now, { DATABASE_URL: "postgres://x" });
    expect(system.runs).toHaveLength(CRON_RUNS_SHOWN);
    expect(system.runs[0]).toMatchObject({
      startedAt: now - 24 * 60 * 60 * 1000,
      status: "abandoned",
    });
    expect(system.services.find((service) => service.id === "database")).toMatchObject({
      configured: true,
    });
    expect(system.services.find((service) => service.id === "blob")).toMatchObject({
      configured: false,
    });
    expect(system.rateLimits.length).toBeGreaterThan(20);
  });
});
