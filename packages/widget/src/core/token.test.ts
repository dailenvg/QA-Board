import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureToken,
  clearStoredToken,
  readStoredToken,
  storeToken,
  TOKEN_STORAGE_KEY,
  TOKEN_TTL_MS,
} from "./token";

const NOW = Date.parse("2026-10-23T10:00:00.000Z");

function visit(url: string): void {
  window.history.replaceState(null, "", url);
}

function stored(): { token: string; expiresAt: number } | null {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { token: string; expiresAt: number });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  visit("/");
});

afterEach(() => {
  visit("/");
});

describe("captureToken", () => {
  it("reads ?review=, stores it with a 14-day expiry, and strips it from the URL", () => {
    visit("/pricing?review=s3cret&utm=x#plans");
    const replaceState = vi.spyOn(window.history, "replaceState");

    expect(captureToken(window, NOW)).toBe("s3cret");
    expect(stored()).toEqual({ token: "s3cret", expiresAt: NOW + TOKEN_TTL_MS });
    expect(sessionStorage.length).toBe(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/pricing?utm=x#plans");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/pricing?utm=x#plans",
    );
  });

  it("preserves existing history state (routers keep data there)", () => {
    window.history.replaceState({ __router: 1 }, "", "/?review=abc");
    captureToken(window, NOW);
    expect(window.history.state).toEqual({ __router: 1 });
  });

  it("re-strips after a router restores the token, and lets a patched router sync", () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState({ __NA: true, tree: "t" }, "", "/?review=abc&x=1");
      captureToken(window, NOW);
      expect(window.location.search).toBe("?x=1");

      // A router (as Next.js does on hydration) re-applies its stale URL...
      window.history.replaceState({ __NA: true, tree: "t" }, "", "/?review=abc&x=1");
      // ...and patches replaceState, skipping sync for writes marked as its own.
      const seen: unknown[] = [];
      window.history.replaceState = function patched(
        this: History,
        data: unknown,
        unused: string,
        url?: string | URL | null,
      ) {
        seen.push(data);
        History.prototype.replaceState.call(this, data, unused, url);
      };

      vi.runAllTimers();

      expect(window.location.search).toBe("?x=1");
      expect(seen).toEqual([{ tree: "t" }]);
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(window.history, "replaceState");
    }
  });

  it("falls back to a remembered token that has not expired", () => {
    storeToken("earlier", NOW);
    expect(captureToken(window, NOW + TOKEN_TTL_MS - 1)).toBe("earlier");
  });

  it("ignores and removes an expired token", () => {
    storeToken("old", NOW);
    expect(captureToken(window, NOW + TOKEN_TTL_MS)).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("refreshes the token and expiry when ?review= is visited again", () => {
    storeToken("old", NOW);
    visit("/?review=new");
    expect(captureToken(window, NOW + 1000)).toBe("new");
    expect(stored()).toEqual({ token: "new", expiresAt: NOW + 1000 + TOKEN_TTL_MS });
  });

  it("returns null without a token anywhere", () => {
    expect(captureToken(window, NOW)).toBeNull();
  });

  it("strips an empty review param without storing it", () => {
    visit("/?review=");
    expect(captureToken(window, NOW)).toBeNull();
    expect(window.location.search).toBe("");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("keeps working for this page view when localStorage access throws", () => {
    visit("/?review=abc");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(captureToken(window, NOW)).toBe("abc");
    expect(readStoredToken(NOW)).toBeNull();
    expect(() => clearStoredToken()).not.toThrow();
  });

  it("keeps working when every storage method throws (private mode quota)", () => {
    visit("/?review=abc");
    const throwing = {
      getItem: () => {
        throw new Error("QuotaExceeded");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {
        throw new Error("QuotaExceeded");
      },
    } as unknown as Storage;
    vi.spyOn(window, "localStorage", "get").mockReturnValue(throwing);
    expect(captureToken(window, NOW)).toBe("abc");
    expect(readStoredToken(NOW)).toBeNull();
  });
});

describe("readStoredToken", () => {
  it.each([
    ["plain string from an older version", "just-a-token"],
    ["missing expiry", JSON.stringify({ token: "x" })],
    ["blank token", JSON.stringify({ token: " ", expiresAt: NOW + 1 })],
  ])("treats %s as invalid and removes it", (_label, raw) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, raw);
    expect(readStoredToken(NOW)).toBeNull();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe("clearStoredToken", () => {
  it("removes the stored token", () => {
    storeToken("abc", NOW);
    clearStoredToken();
    expect(readStoredToken(NOW)).toBeNull();
  });
});
