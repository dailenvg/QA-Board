import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureToken, clearStoredToken, readStoredToken, TOKEN_STORAGE_KEY } from "./token";

function visit(url: string): void {
  window.history.replaceState(null, "", url);
}

beforeEach(() => {
  sessionStorage.clear();
  visit("/");
});

afterEach(() => {
  visit("/");
});

describe("captureToken", () => {
  it("reads ?review=, stores it, and strips it from the URL", () => {
    visit("/pricing?review=s3cret&utm=x#plans");
    const replaceState = vi.spyOn(window.history, "replaceState");

    expect(captureToken()).toBe("s3cret");
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe("s3cret");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/pricing?utm=x#plans");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/pricing?utm=x#plans",
    );
  });

  it("preserves existing history state (routers keep data there)", () => {
    window.history.replaceState({ __router: 1 }, "", "/?review=abc");
    captureToken();
    expect(window.history.state).toEqual({ __router: 1 });
  });

  it("falls back to the token stored earlier in this tab", () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, "earlier");
    expect(captureToken()).toBe("earlier");
  });

  it("returns null without a token anywhere", () => {
    expect(captureToken()).toBeNull();
  });

  it("strips an empty review param without storing it", () => {
    visit("/?review=");
    expect(captureToken()).toBeNull();
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("keeps working when sessionStorage throws", () => {
    visit("/?review=abc");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(captureToken()).toBe("abc");
  });
});

describe("clearStoredToken", () => {
  it("removes the stored token", () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, "abc");
    clearStoredToken();
    expect(readStoredToken()).toBeNull();
  });
});
