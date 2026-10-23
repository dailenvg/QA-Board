import type { CreatePinInput, Pin } from "../core/types";

export const anchorFixture = {
  selector: "#hero",
  xPct: 50,
  yPct: 50,
  viewportXPct: 50,
  viewportYPct: 25,
};

export function createPinInput(overrides: Partial<CreatePinInput> = {}): CreatePinInput {
  return {
    path: "/",
    pageUrl: "https://preview.vercel.app/",
    anchor: anchorFixture,
    author: "Ana",
    body: "Make this bigger",
    priority: "should",
    screenshot: null,
    context: { viewport: { width: 1280, height: 800 }, userAgent: "test" },
    ...overrides,
  };
}

export function pinFixture(overrides: Partial<Pin> = {}): Pin {
  return {
    id: "pin-1",
    path: "/",
    branch: "feature/x",
    deploymentUrl: "https://preview.vercel.app",
    deepLink: "https://preview.vercel.app/?pin=pin-1",
    anchor: anchorFixture,
    author: "Ana",
    body: "Make this bigger",
    priority: null,
    screenshotUrl: null,
    context: { viewport: { width: 1280, height: 800 }, userAgent: "test" },
    replies: [],
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: "2026-10-23T10:00:00.000Z",
    ...overrides,
  };
}
