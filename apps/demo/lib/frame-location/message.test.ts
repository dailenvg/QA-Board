import { describe, expect, it } from "vitest";
import { LOCATION_MESSAGE, readLocationMessage } from "./message";

const SITE = "https://acme.example/";
const frame = { name: "the review's iframe" };
const message = (overrides: Partial<{ data: unknown; origin: string; source: unknown }> = {}) => ({
  data: { type: LOCATION_MESSAGE, href: "https://acme.example/pricing#plans" },
  origin: "https://acme.example",
  source: frame,
  ...overrides,
});

describe("readLocationMessage", () => {
  it("reads the page a same-origin frame says it's on", () => {
    expect(readLocationMessage(message(), frame, SITE)).toBe("https://acme.example/pricing");
  });

  it("ignores messages from anywhere but the review's frame", () => {
    expect(readLocationMessage(message({ source: {} }), frame, SITE)).toBeNull();
    expect(readLocationMessage(message({ source: null }), null, SITE)).toBeNull();
  });

  it("ignores a frame that has navigated to another origin", () => {
    expect(
      readLocationMessage(message({ origin: "https://evil.example" }), frame, SITE),
    ).toBeNull();
    expect(readLocationMessage(message({ origin: "null" }), frame, SITE)).toBeNull();
  });

  it("ignores addresses on another origin, or that aren't web pages", () => {
    const href = (value: unknown) =>
      readLocationMessage(message({ data: { type: LOCATION_MESSAGE, href: value } }), frame, SITE);
    expect(href("https://evil.example/")).toBeNull();
    expect(href("javascript:alert(1)")).toBeNull();
    expect(href(42)).toBeNull();
  });

  it("ignores other messages", () => {
    expect(readLocationMessage(message({ data: "squint:location" }), frame, SITE)).toBeNull();
    expect(
      readLocationMessage(message({ data: { type: "other", href: SITE } }), frame, SITE),
    ).toBeNull();
  });
});
