import type { Page } from "@playwright/test";

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
