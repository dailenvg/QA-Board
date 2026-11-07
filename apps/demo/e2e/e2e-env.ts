/**
 * The e2e database and accounts. Test-only credentials, created in the e2e
 * database by the global setup; never used anywhere else.
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * `E2E_DATABASE_URL`, refused unless it points at this machine: the global
 * setup empties every table in it.
 */
export function e2eDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.E2E_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "E2E_DATABASE_URL is not set. Point it at a throwaway local Postgres, e.g. postgres://squint:squint@127.0.0.1:54329/squint_e2e",
    );
  }
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid postgres:// URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `E2E_DATABASE_URL must point at 127.0.0.1 or localhost (got ${host}): the e2e setup empties it.`,
    );
  }
  return value;
}

export const E2E_ADMIN = { email: "admin@e2e.test", password: "e2e admin password" } as const;

export const E2E_COMPANY = {
  slug: "e2e-agency",
  name: "E2E Agency",
  email: "owner@e2e.test",
  password: "e2e owner password",
} as const;

/** The signed-in browser state every project starts from (cookies only). */
export const SESSION_STATE = "e2e/.auth/session.json";
