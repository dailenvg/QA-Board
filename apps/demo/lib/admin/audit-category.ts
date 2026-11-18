/**
 * The audit log's actions, grouped by what they're about, from the prefix
 * every action carries (`lib/account/audit.ts`). Client-safe.
 */
export type AuditCategory =
  "account" | "workspace" | "people" | "projects" | "reviewLinks" | "admin" | "other";

/** Every category, in the order the admin panel lists them. */
export const AUDIT_CATEGORIES: readonly AuditCategory[] = [
  "account",
  "workspace",
  "people",
  "projects",
  "reviewLinks",
  "admin",
  "other",
];

const BY_PREFIX: Readonly<Record<string, AuditCategory>> = {
  user: "account",
  workspace: "workspace",
  membership: "people",
  member: "people",
  project: "projects",
  share: "reviewLinks",
  admin: "admin",
};

/** The category of `action` ("user.name_changed" is account); "other" for a prefix it doesn't know (the seed's). */
export function auditCategory(action: string): AuditCategory {
  const prefix = action.split(".", 1)[0] ?? "";
  return Object.hasOwn(BY_PREFIX, prefix) ? (BY_PREFIX[prefix] ?? "other") : "other";
}
