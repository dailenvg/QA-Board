import { describe, expect, it } from "vitest";
import { canCreateShares } from "./server";

describe("canCreateShares", () => {
  it("creates shares wherever a database is configured", () => {
    expect(canCreateShares({ DATABASE_URL: "postgres://db" })).toBe(true);
    expect(canCreateShares({ DATABASE_URL: "postgres://db", VERCEL_ENV: "production" })).toBe(true);
    expect(canCreateShares({ DATABASE_URL: "postgres://db", VERCEL_ENV: "preview" })).toBe(true);
  });

  it("refuses on Vercel production and preview without a database", () => {
    expect(canCreateShares({ VERCEL_ENV: "production" })).toBe(false);
    expect(canCreateShares({ VERCEL_ENV: "preview", DATABASE_URL: "" })).toBe(false);
  });

  it("keeps the memory store for local runs, e2e and vercel dev", () => {
    expect(canCreateShares({})).toBe(true);
    expect(canCreateShares({ DATABASE_URL: "" })).toBe(true);
    expect(canCreateShares({ VERCEL_ENV: "development" })).toBe(true);
  });
});
