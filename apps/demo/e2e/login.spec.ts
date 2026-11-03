import { expect, test } from "@playwright/test";
import { signIn, SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("a protected page sends you to sign in, then back there, with Squiggy's welcome", async ({
    page,
  }) => {
    await page.goto("/f/missing-folder?sort=name");
    await expect(page).toHaveURL(/\/login\?next=%2Ff%2Fmissing-folder%3Fsort%3Dname$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to Squint" })).toBeVisible();
    await signIn(page, E2E_COMPANY);
    // Back where it was going, the one-shot welcome flag already gone.
    await expect(page).toHaveURL(/\/f\/missing-folder\?sort=name$/);
    await expect(page.getByText(E2E_COMPANY.email)).toBeVisible();

    await page.goto("/");
    await expect(page.getByTestId("sign-out")).toBeVisible();
  });

  test("Squiggy says welcome back on the Overview after signing in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, E2E_COMPANY);
    await expect(page.getByTestId("squiggy-speech")).toHaveAttribute("data-kind", "signed-in");
    await expect(page).toHaveURL(/\/$/);
  });

  test("a wrong password gets the generic message and an empty password field", async ({
    page,
  }) => {
    await page.goto("/login");
    await signIn(page, { email: E2E_COMPANY.email, password: "not the password" });
    await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toHaveText(
      "Invalid email or password.",
    );
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Password")).toHaveValue("");
    await expect(page.getByLabel("Password")).toBeFocused();
  });

  test("checks fields when you leave them", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").focus();
    await expect(page.getByText("Enter an email address like name@company.com.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("locks an email after 5 failures: 429 with Retry-After, and the form says so", async ({
    page,
    playwright,
  }, testInfo) => {
    const email = `locked-${testInfo.project.name}@e2e.test`;
    // Its own address, so the per-IP limit of other tests is untouched.
    const api = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${testInfo.workerIndex + 10}` },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api.post("/api/auth/login", { data: { email, password: "wrong" } });
      expect(response.status()).toBe(401);
    }
    const locked = await api.post("/api/auth/login", { data: { email, password: "wrong" } });
    expect(locked.status()).toBe(429);
    expect(Number(locked.headers()["retry-after"])).toBeGreaterThan(800);
    await api.dispose();

    await page.goto("/login");
    await signIn(page, { email, password: "anything at all" });
    await expect(page.getByRole("alert").filter({ hasText: "Too many" })).toHaveText(
      "Too many attempts. Try again in 15 minutes.",
    );
  });

  test("API routes answer 401 instead of redirecting", async ({ playwright }, testInfo) => {
    const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
    const response = await api.post("/api/capture", { data: {}, maxRedirects: 0 });
    expect(response.status()).toBe(401);
    await api.dispose();
  });

  test("signing out ends the session and protects the dashboard again", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, E2E_COMPANY);
    await expect(page.getByTestId("sign-out")).toBeVisible();
    const cookie = (await page.context().cookies()).find(
      (entry) => entry.name === "squint_session",
    );
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });

    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/login$/);
    // The old cookie, replayed, no longer opens anything.
    if (cookie) await page.context().addCookies([cookie]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a reset request answers the same for known and unknown emails", async ({ page }) => {
    for (const email of [E2E_COMPANY.email, "nobody@e2e.test"]) {
      await page.goto("/reset");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
      await expect(page.getByTestId("reset-sent")).toHaveText(
        `If ${email} has a Squint account, a link to choose a new password is on its way. It works once, for one hour.`,
      );
    }
  });

  test("an unknown reset link says it has expired and offers a new one", async ({ page }) => {
    const response = await page.goto(`/reset/${"x".repeat(43)}`);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(
      page.getByRole("heading", { level: 1, name: "This link has expired" }),
    ).toBeVisible();
    await page.getByTestId("reset-again").click();
    await expect(page).toHaveURL(/\/reset$/);
  });
});

test("signed in, /login goes straight on to the Overview", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});
