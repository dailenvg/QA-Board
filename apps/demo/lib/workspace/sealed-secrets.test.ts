import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./sealed-secrets";

const SECRET = "test-auth-secret-0123456789abcdef";

describe("sealed secrets", () => {
  it("round-trips, with a fresh IV every time", () => {
    const first = sealSecret("token-value", "ctx", SECRET);
    const second = sealSecret("token-value", "ctx", SECRET);
    expect(first).not.toBe(second);
    expect(first).not.toContain("token-value");
    expect(openSecret(first, "ctx", SECRET)).toBe("token-value");
  });

  it("opens only for the same context and key, and refuses tampering", () => {
    const sealed = sealSecret("token-value", "share-link:a:p1:token", SECRET);
    expect(() => openSecret(sealed, "share-link:b:p1:token", SECRET)).toThrow(/did not open/);
    expect(() => openSecret(sealed, "share-link:a:p1:token", `${SECRET}x`)).toThrow(/did not open/);
    const [version, iv, data, tag] = sealed.split(".");
    const flipped = `${data?.[0] === "A" ? "B" : "A"}${data?.slice(1)}`;
    expect(() =>
      openSecret([version, iv, flipped, tag].join("."), "share-link:a:p1:token", SECRET),
    ).toThrow();
    expect(() =>
      openSecret([version, iv, data, tag?.slice(0, 8)].join("."), "share-link:a:p1:token", SECRET),
    ).toThrow(/format/);
  });

  it("needs AUTH_SECRET", () => {
    expect(() => sealSecret("x", "ctx", "")).toThrow(/AUTH_SECRET/);
    expect(() => openSecret("v1.a.b.c", "ctx", " ")).toThrow(/AUTH_SECRET/);
  });
});
