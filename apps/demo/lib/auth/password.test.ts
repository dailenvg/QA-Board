import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes with Argon2id, 19 MiB, 2 passes, 1 lane, salted", async () => {
    const [first, second] = await Promise.all([hashPassword("hunter22"), hashPassword("hunter22")]);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(first).not.toBe(second);
  });

  it("verifies the right password only", async () => {
    const stored = await hashPassword("hunter22");
    expect(await verifyPassword("hunter22", stored)).toBe(true);
    expect(await verifyPassword("hunter23", stored)).toBe(false);
  });

  it("answers false, without throwing, for no user or a broken hash", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});
