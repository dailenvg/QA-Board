import { SHARE_LIMITS } from "../share/limits";

/**
 * A reviewer's name, remembered for one review link. The cookie is scoped to
 * the link's path, so each link asks once and no link sees another's name.
 * It's readable by the page (not HttpOnly) and never identifies anyone: the
 * server only reads it to render the page with the name already filled in.
 */
export const REVIEWER_NAME_COOKIE = "squint_reviewer_name";

/** 90 days, in seconds. */
export const REVIEWER_NAME_MAX_AGE = 90 * 24 * 60 * 60;

/** Where names were kept before: one for every link in this browser. Moved to a link once, then deleted. */
export const LEGACY_NAME_KEY = "squint:reviewer-name";

/** Remembers a reviewer's name for one link, in this browser. */
export interface ReviewerNameMemory {
  save: (name: string) => void;
  /**
   * The name kept for every link before names were kept per link, if this
   * link has none yet: it's saved for this link and the old key is deleted,
   * so only the first link opened afterwards gets it.
   */
  carryOver: () => string | null;
}

/**
 * Trimmed, single-spaced and cut to the share's author length (as the
 * composer does), never ending in half of a character outside the BMP.
 */
export function capName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, SHARE_LIMITS.author)
    .replace(/[\uD800-\uDBFF]$/, "");
}

/** The review link's path, which scopes its name cookie. */
export function reviewLinkPath(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

/** The `document.cookie` assignment that remembers `name` for the link. */
export function nameCookie(token: string, name: string, secure: boolean): string {
  const parts = [
    `${REVIEWER_NAME_COOKIE}=${encodeURIComponent(capName(name))}`,
    `Path=${reviewLinkPath(token)}`,
    `Max-Age=${REVIEWER_NAME_MAX_AGE}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** The name in a `Cookie` header or `document.cookie`, or null when there's none (or it's unreadable). */
export function reviewerNameOf(cookies: string | null): string | null {
  for (const pair of cookies?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=");
    if (key !== REVIEWER_NAME_COOKIE) continue;
    try {
      return capName(decodeURIComponent(value.join("="))) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The browser's memory for the link `token`: its path-scoped cookie. */
export function linkNameMemory(token: string): ReviewerNameMemory {
  const write = (name: string) => {
    document.cookie = nameCookie(token, name, location.protocol === "https:");
  };
  return {
    save(name) {
      try {
        write(name);
      } catch {
        // Cookies blocked: not remembered, so the name is asked again next visit.
      }
    },
    carryOver() {
      try {
        if (reviewerNameOf(document.cookie)) return null;
        const name = capName(localStorage.getItem(LEGACY_NAME_KEY) ?? "");
        if (!name) return null;
        write(name);
        localStorage.removeItem(LEGACY_NAME_KEY);
        return name;
      } catch {
        // Storage or cookies blocked: the old name stays where it was.
        return null;
      }
    },
  };
}
