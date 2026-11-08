import { expect, test } from "./test";
import { createResetLink, recordUrls, signIn, SIGNED_OUT } from "./auth-fixtures";
import { E2E_ADMIN, E2E_COMPANY } from "./e2e-env";

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

  test("a wrong password gets the generic message, an empty password field and a reset link", async ({
    page,
  }) => {
    await page.goto("/login");
    await signIn(page, { email: E2E_COMPANY.email, password: "not the password" });
    const alert = page.getByRole("alert").filter({ hasText: "Invalid" });
    await expect(alert).toHaveText(
      "Invalid email or password. Check both and try again, or reset your password.",
    );
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Password")).toHaveValue("");
    await expect(page.getByLabel("Password")).toBeFocused();
    await alert.getByRole("link", { name: "reset your password" }).click();
    await expect(page).toHaveURL(/\/reset$/);
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

  test("the limits hold when wrong passwords arrive all at once", async ({
    playwright,
  }, testInfo) => {
    const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
    const run = testInfo.project.name;
    const attempt = (email: string, ip: string) =>
      api
        .post("/api/auth/login", {
          data: { email, password: "wrong" },
          headers: { "x-forwarded-for": ip },
        })
        .then((response) => response.status());

    // 30 at once for one email, each from its own address: 5 get checked, the rest wait.
    const email = `race-${run}@e2e.test`;
    const byEmail = await Promise.all(
      Array.from({ length: 30 }, (_, index) => attempt(email, `203.0.113.${index + 1}`)),
    );
    expect(byEmail.filter((status) => status !== 429)).toEqual(Array(5).fill(401));

    // 40 at once from one address, each for its own email: 20 get checked.
    const ip = `192.0.2.${run === "mobile" ? 2 : 1}`;
    const byIp = await Promise.all(
      Array.from({ length: 40 }, (_, index) => attempt(`race-${run}-${index}@e2e.test`, ip)),
    );
    expect(byIp.filter((status) => status !== 429)).toEqual(Array(20).fill(401));
    await api.dispose();
  });

  test("API routes answer 401 instead of redirecting", async ({ playwright }, testInfo) => {
    const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
    const response = await api.post("/api/capture", { data: {}, maxRedirects: 0 });
    expect(response.status()).toBe(401);
    await api.dispose();
  });

  test("capture checks the session itself, not just that a cookie is there", async ({
    playwright,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    const forged = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { cookie: `squint_session=${"x".repeat(43)}` },
    });
    const response = await forged.post("/api/capture", {
      data: { url: "https://example.com/", width: 1280 },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
    await forged.dispose();

    // Guests capture through their share's own route, which needs no session: an unknown link
    // gets the share's 404, never the 401.
    const guest = await playwright.request.newContext({ baseURL });
    const shared = await guest.post(`/api/s/${"y".repeat(43)}/capture`, { data: { width: 1280 } });
    expect(shared.status()).toBe(404);
    await guest.dispose();
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
    expect(response?.headers()["referrer-policy"]).toBe("same-origin");
    await expect(
      page.getByRole("heading", { level: 1, name: "This link has expired" }),
    ).toBeVisible();
    await page.getByTestId("reset-again").click();
    await expect(page).toHaveURL(/\/reset$/);
  });
});

test.describe("submitted before hydration (JavaScript off)", () => {
  test.use({ storageState: SIGNED_OUT, javaScriptEnabled: false });

  test("signing in posts the form: errors and success arrive by redirect, no credential in a URL", async ({
    page,
  }) => {
    const urls = recordUrls(page);
    await page.goto("/login?next=%2Ff%2Fabc");
    await signIn(page, { email: E2E_COMPANY.email, password: "not the password" });
    await expect(page).toHaveURL(/\/login\?next=%2Ff%2Fabc&error=invalid-credentials$/);
    await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toHaveText(
      "Invalid email or password. Check both and try again, or reset your password.",
    );

    await signIn(page, E2E_COMPANY);
    await expect(page).toHaveURL(/\/f\/abc\?welcome=1$/);
    const leaked = urls.filter((url) =>
      [E2E_COMPANY.password, "not the password", E2E_COMPANY.email].some((secret) =>
        url.includes(secret),
      ),
    );
    expect(leaked).toEqual([]);
  });

  test("a reset request and a new password post without JavaScript, keeping both out of URLs", async ({
    page,
  }) => {
    const urls = recordUrls(page);
    await page.goto("/reset");
    await page.getByLabel("Email").fill(E2E_ADMIN.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page).toHaveURL(/\/reset\?sent=1$/);
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();

    // The admin account: no other spec signs in as it.
    const link = await createResetLink(E2E_ADMIN.email);
    const fresh = "a fresh admin password";
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill(fresh);
    await page.getByLabel("New password, again").fill(`${fresh}!`);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(new RegExp(`${link}\\?error=mismatch$`));
    await expect(page.getByRole("alert").filter({ hasText: "match" })).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(fresh);
    await page.getByLabel("New password, again").fill(fresh);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=done$/);
    await expect(page.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();

    const leaked = urls.filter((url) => url.includes(fresh) || url.includes(E2E_ADMIN.email));
    expect(leaked).toEqual([]);
  });
});

test("signed in, capture gets past the session check", async ({ page }) => {
  // An empty body: refused for its input (400), so the session itself was accepted.
  const response = await page.request.post("/api/capture", { data: {} });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid-request" });
});

test("signed in, /login goes straight on to the Overview", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});
