import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberedMode, rememberMode } from "./mode-memory";

/** A localStorage that keeps what it's given, or refuses everything (private modes, quotas). */
function localStorageStub(refuse = false) {
  const items = new Map<string, string>();
  const fail = () => {
    throw new DOMException("refused", "SecurityError");
  };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (refuse ? fail() : (items.get(key) ?? null)),
    setItem: (key: string, value: string) => (refuse ? fail() : items.set(key, value)),
  });
  return items;
}

afterEach(() => vi.unstubAllGlobals());

// The module keeps this visit's choices, so each test uses scopes of its own.
describe("the viewer's remembered mode", () => {
  it("is remembered per project, under its own key", () => {
    const items = localStorageStub();
    rememberMode("p-saved", "comment");
    expect(items.get("squint:viewer-mode:p-saved")).toBe("comment");
    expect(rememberedMode("p-saved")).toBe("comment");
    expect(rememberedMode("p-other")).toBeNull();
  });

  it("reads what an earlier visit stored", () => {
    const items = localStorageStub();
    items.set("squint:viewer-mode:p-earlier", "browse");
    expect(rememberedMode("p-earlier")).toBe("browse");
  });

  it("ignores anything stored that isn't a mode", () => {
    const items = localStorageStub();
    items.set("squint:viewer-mode:p-junk", "draw");
    expect(rememberedMode("p-junk")).toBeNull();
  });

  it("keeps a choice for this visit where storage is refused", () => {
    localStorageStub(true);
    expect(rememberedMode("p-refused")).toBeNull();
    expect(() => rememberMode("p-refused", "comment")).not.toThrow();
    expect(rememberedMode("p-refused")).toBe("comment");
  });

  it("finds nothing where there's no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(rememberedMode("p-none")).toBeNull();
  });
});
