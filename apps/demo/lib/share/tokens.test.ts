import { describe, expect, it } from "vitest";
import { createSecret, createShareId, hashSecret, isSecretShape, secretMatches } from "./tokens";

describe("share secrets", () => {
  it("are 32 random bytes in base64url, unique each time", () => {
    const secret = createSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(createSecret()).not.toBe(secret);
    expect(isSecretShape(secret)).toBe(true);
    expect(isSecretShape(`${secret}=`)).toBe(false);
    expect(createShareId()).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("are stored only as a SHA-256 hash and checked against it", () => {
    const secret = createSecret();
    const hash = hashSecret(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
    expect(secretMatches(secret, hash)).toBe(true);
    expect(secretMatches(createSecret(), hash)).toBe(false);
    expect(secretMatches(secret, "not-a-hash")).toBe(false);
  });
});
