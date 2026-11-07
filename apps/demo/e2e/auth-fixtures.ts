import { createHash, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2e-env";

/** Fills in /login and submits. */
export async function signIn(
  page: Page,
  { email, password }: { email: string; password: string },
): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A browser state with no session, for specs that start signed out. */
export const SIGNED_OUT = { cookies: [], origins: [] };

/**
 * A usable password reset link for `email`, written straight into the e2e
 * database (the e2e server sends no email). Returns the link's path.
 */
export async function createResetLink(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       SELECT id, $1, now() + interval '1 hour' FROM users WHERE email = $2`,
      [createHash("sha256").update(token).digest("hex"), email],
    );
  } finally {
    await client.end();
  }
  return `/reset/${token}`;
}

/**
 * A session cookie for `email`, written straight into the e2e database, for a
 * context that must be signed in as an account other specs change the password of.
 */
export async function sessionCookie(
  email: string,
  baseURL: string,
): Promise<{ name: string; value: string; url: string }> {
  const token = randomBytes(32).toString("base64url");
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       SELECT $1, id, now() + interval '1 hour' FROM users WHERE email = $2`,
      [createHash("sha256").update(token).digest("hex"), email],
    );
  } finally {
    await client.end();
  }
  return { name: "squint_session", value: token, url: baseURL };
}

/** Every URL a page asks for or navigates to, to prove what never appears in one. */
export function recordUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(decodeURIComponent(request.url())));
  page.on("framenavigated", (frame) => urls.push(decodeURIComponent(frame.url())));
  return urls;
}
