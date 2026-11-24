import { describe, expect, it } from "vitest";
import { sendsOnEnter } from "./send-key";

const key = (overrides: Partial<Parameters<typeof sendsOnEnter>[0]> = {}) =>
  sendsOnEnter({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, ...overrides });

describe("sendsOnEnter", () => {
  it("sends on Enter, with or without Cmd or Ctrl", () => {
    expect(key()).toBe(true);
    expect(key({ keyCode: undefined })).toBe(true);
  });

  it("leaves Shift+Enter to add a new line", () => {
    expect(key({ shiftKey: true })).toBe(false);
  });

  it("leaves an Enter that picks an input method's word, Safari's included", () => {
    expect(key({ isComposing: true })).toBe(false);
    expect(key({ keyCode: 229 })).toBe(false);
  });

  it("ignores every other key", () => {
    expect(key({ key: "a", keyCode: 65 })).toBe(false);
    expect(key({ key: "Escape", keyCode: 27 })).toBe(false);
  });
});
