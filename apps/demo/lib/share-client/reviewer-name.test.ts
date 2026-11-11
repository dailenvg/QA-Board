import { afterEach, describe, expect, it, vi } from "vitest";
import { SHARE_LIMITS } from "../share/limits";
import {
  capName,
  LEGACY_NAME_KEY,
  linkNameMemory,
  nameCookie,
  REVIEWER_NAME_COOKIE,
  reviewerNameOf,
} from "./reviewer-name";

const A = "a".repeat(43);
const B = "b".repeat(43);

/** RFC 6265 path-match: the cookie's path is the request's, or a directory of it. */
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  return (
    requestPath.startsWith(cookiePath) &&
    (cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/")
  );
}

/**
 * A browser on `path`: `document.cookie` keeps cookies by name and path and
 * shows only those whose path matches the page, as browsers do.
 */
function browserAt(path: string) {
  const jar = new Map<string, { name: string; value: string; path: string }>();
  const storage = new Map<string, string>();
  const location = { pathname: path, protocol: "https:" };
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar.values()]
        .filter((cookie) => pathMatches(location.pathname, cookie.path))
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    },
    set cookie(line: string) {
      const [pair = "", ...attributes] = line.split("; ");
      const [name = "", ...value] = pair.split("=");
      const path = attributes.find((part) => part.startsWith("Path="))?.slice(5) ?? "/";
      jar.set(`${name} ${path}`, { name, value: value.join("="), path });
    },
  });
  return {
    storage,
    visit: (next: string) => void (location.pathname = next),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("the name cookie", () => {
  it("is scoped to the link for 90 days, Lax, and Secure on https", () => {
    expect(nameCookie(A, "Cleo", true)).toBe(
      `${REVIEWER_NAME_COOKIE}=Cleo; Path=/s/${A}; Max-Age=7776000; SameSite=Lax; Secure`,
    );
    expect(nameCookie(A, "Cleo", false)).not.toContain("Secure");
  });

  it("names no token: the path alone tells links apart", () => {
    expect(nameCookie(A, "Cleo", true).split(";")[0]).not.toContain(A);
  });

  it("encodes the name, so it can't add attributes or other cookies", () => {
    const cookie = nameCookie(A, "Cleo; Path=/; Max-Age=0, x=1", true);
    expect(cookie.split("; ")).toHaveLength(5);
    expect(reviewerNameOf(cookie.split("; ")[0] ?? "")).toBe("Cleo; Path=/; Max-Age=0, x=1");
  });

  it("is read back from a Cookie header among others", () => {
    const value = nameCookie(A, "Zoë  Ng", true).split("; ")[0];
    expect(reviewerNameOf(`squint_session=x; ${value}; theme=dark`)).toBe("Zoë Ng");
  });

  it("reads as no name when missing, blank or malformed", () => {
    expect(reviewerNameOf(null)).toBeNull();
    expect(reviewerNameOf("theme=dark")).toBeNull();
    expect(reviewerNameOf(`${REVIEWER_NAME_COOKIE}=%20%20`)).toBeNull();
    expect(reviewerNameOf(`${REVIEWER_NAME_COOKIE}=%E0%A4%A`)).toBeNull();
  });

  it("caps the name at the share's author length, written or read", () => {
    const long = "x".repeat(SHARE_LIMITS.author + 40);
    const written = nameCookie(A, long, true).split("; ")[0] ?? "";
    expect(reviewerNameOf(written)).toHaveLength(SHARE_LIMITS.author);
    expect(reviewerNameOf(`${REVIEWER_NAME_COOKIE}=${long}`)).toHaveLength(SHARE_LIMITS.author);
  });

  it("never cuts a character in half at the cap", () => {
    const name = `${"x".repeat(SHARE_LIMITS.author - 1)}😀`;
    expect(capName(name)).toBe("x".repeat(SHARE_LIMITS.author - 1));
    expect(() => nameCookie(A, name, true)).not.toThrow();
  });
});

describe("a link's name memory", () => {
  it("keeps each link's name apart", () => {
    const browser = browserAt(`/s/${A}`);
    linkNameMemory(A).save("Cleo");
    expect(reviewerNameOf(document.cookie)).toBe("Cleo");

    browser.visit(`/s/${B}`);
    expect(reviewerNameOf(document.cookie)).toBeNull();
    linkNameMemory(B).save("Ana");
    expect(reviewerNameOf(document.cookie)).toBe("Ana");

    browser.visit(`/s/${A}`);
    expect(reviewerNameOf(document.cookie)).toBe("Cleo");
    // A token that only starts with another's doesn't see its name.
    browser.visit(`/s/${A}x`);
    expect(reviewerNameOf(document.cookie)).toBeNull();
  });

  it("moves the old name for every link to the first link opened, then deletes it", () => {
    const browser = browserAt(`/s/${A}`);
    browser.storage.set(LEGACY_NAME_KEY, " Cleo ");
    expect(linkNameMemory(A).carryOver()).toBe("Cleo");
    expect(reviewerNameOf(document.cookie)).toBe("Cleo");
    expect(browser.storage.has(LEGACY_NAME_KEY)).toBe(false);

    browser.visit(`/s/${B}`);
    expect(linkNameMemory(B).carryOver()).toBeNull();
    expect(reviewerNameOf(document.cookie)).toBeNull();
  });

  it("leaves the old name alone on a link that already has one", () => {
    const browser = browserAt(`/s/${A}`);
    linkNameMemory(A).save("Ana");
    browser.storage.set(LEGACY_NAME_KEY, "Cleo");
    expect(linkNameMemory(A).carryOver()).toBeNull();
    expect(reviewerNameOf(document.cookie)).toBe("Ana");
    expect(browser.storage.get(LEGACY_NAME_KEY)).toBe("Cleo");
  });

  it("carries nothing over when there's no old name", () => {
    browserAt(`/s/${A}`);
    expect(linkNameMemory(A).carryOver()).toBeNull();
    expect(document.cookie).toBe("");
  });
});
