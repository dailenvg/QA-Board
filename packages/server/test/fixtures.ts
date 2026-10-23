import type { PinDraft } from "../src/storage";
import type { CreatePinInput, Pin } from "../src/types";

/** Smallest valid PNG header plus a few bytes. */
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
export const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

export const anchor = { selector: "#cta", xPct: 50, yPct: 50, viewportXPct: 40, viewportYPct: 20 };

export function createInput(overrides: Partial<CreatePinInput> = {}): CreatePinInput {
  return {
    path: "/pricing",
    pageUrl: "https://feature-x.preview.app/pricing?plan=pro&review=secret#faq",
    anchor,
    author: "Ana",
    body: "Make the CTA larger",
    priority: "should",
    screenshot: null,
    context: { viewport: { width: 1280, height: 800 }, userAgent: "vitest" },
    ...overrides,
  };
}

export function pin(overrides: Partial<Pin> = {}): Pin {
  return {
    id: "pin-1",
    path: "/pricing",
    branch: "feature/x",
    deploymentUrl: "https://feature-x.preview.app",
    deepLink: "https://feature-x.preview.app/pricing?pin=pin-1",
    anchor,
    author: "Ana",
    body: "Make the CTA larger",
    priority: "should",
    screenshotUrl: null,
    context: { viewport: { width: 1280, height: 800 }, userAgent: "vitest" },
    replies: [],
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: "2026-10-23T10:00:00.000Z",
    ...overrides,
  };
}

export function draft(overrides: Partial<PinDraft> = {}): PinDraft {
  const { screenshotUrl: _unused, ...base } = pin();
  return { ...base, branch: "feature/x", screenshot: null, ...overrides };
}
