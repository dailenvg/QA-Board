import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHROMIUM_VERSION, chromiumPackUrl } from "./chromium-pack";

const RELEASE = "https://github.com/Sparticuz/chromium/releases/download/v153.0.0";

describe("chromiumPackUrl", () => {
  it.each([
    ["arm64", `${RELEASE}/chromium-v153.0.0-pack.arm64.tar`],
    ["x64", `${RELEASE}/chromium-v153.0.0-pack.x64.tar`],
  ])("points %s at its GitHub release pack", (arch, url) => {
    expect(chromiumPackUrl("153.0.0", arch, {})).toBe(url);
  });

  it("prefers SQUINT_CHROMIUM_PACK_URL", () => {
    const env = { SQUINT_CHROMIUM_PACK_URL: " https://cdn.example.com/pack.tar " };
    expect(chromiumPackUrl("153.0.0", "arm64", env)).toBe("https://cdn.example.com/pack.tar");
  });

  it("ignores a blank override", () => {
    const env = { SQUINT_CHROMIUM_PACK_URL: "  " };
    expect(chromiumPackUrl("153.0.0", "x64", env)).toBe(
      `${RELEASE}/chromium-v153.0.0-pack.x64.tar`,
    );
  });

  it("rejects architectures without a pack", () => {
    expect(() => chromiumPackUrl("153.0.0", "ia32", {})).toThrow(/ia32/);
  });

  it("matches the installed @sparticuz/chromium-min", () => {
    // The package's exports hide package.json, so find it next to the resolved entry point.
    const entry = createRequire(import.meta.url).resolve("@sparticuz/chromium-min");
    const manifest = join(dirname(entry), "..", "package.json");
    const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
    expect(CHROMIUM_VERSION).toBe(version);
  });
});
