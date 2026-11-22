import { describe, expect, it } from "vitest";
import { isLoginPage, type LoginSignals } from "./login-page";

/** A blank page: no title, no text, nothing to fill in. */
const BLANK: LoginSignals = {
  title: "",
  heading: "",
  passwordInputs: 0,
  forms: 0,
  textLength: 0,
  links: 0,
};

/** A typical sign-in page: one form, a password field, a few links. */
const SIGN_IN: LoginSignals = {
  title: "Acme",
  heading: "Welcome back",
  passwordInputs: 1,
  forms: 1,
  textLength: 240,
  links: 4,
};

/** A long marketing page. */
const MARKETING: LoginSignals = {
  title: "Acme: dashboards your team will love",
  heading: "Ship dashboards in minutes",
  passwordInputs: 0,
  forms: 1,
  textLength: 6_400,
  links: 48,
};

const SITE = new URL("https://acme.example/");

function check(signals: Partial<LoginSignals>, final = SITE, requested = SITE): boolean {
  return isLoginPage(requested, final, { ...BLANK, ...signals });
}

describe("Vercel's deployment protection", () => {
  const deployment = new URL("https://acme-git-main-team.vercel.app/");

  it("is a login page when the capture ends on Vercel's login", () => {
    const login = new URL("https://vercel.com/login?next=%2Fsso-api%3Furl%3Dacme");
    expect(check({ title: "Login – Vercel", links: 6 }, login, deployment)).toBe(true);
  });

  it("is a login page when the capture ends on Vercel's SSO hand-off", () => {
    expect(check({}, new URL("https://vercel.com/sso-api?url=acme&nonce=1"), deployment)).toBe(
      true,
    );
  });

  it("is a login page when the page says 'Log in to Vercel', wherever it is", () => {
    expect(check({ heading: "Log in to Vercel", links: 8 }, deployment, deployment)).toBe(true);
    expect(check({ title: "Log in to Vercel" }, deployment, deployment)).toBe(true);
  });

  it("isn't vercel.com's own pages, nor an article about logging in to it", () => {
    expect(check({ ...MARKETING, title: "Vercel" }, new URL("https://vercel.com/"))).toBe(false);
    expect(check({ ...MARKETING, title: "How to log in to Vercel from the CLI" })).toBe(false);
  });
});

describe("a generic login page", () => {
  it("is a page that's little besides a password form", () => {
    expect(check(SIGN_IN)).toBe(true);
  });

  it("is a password form the capture was redirected to a login address for", () => {
    const busy = { ...SIGN_IN, textLength: 5_000, links: 40 };
    expect(check(busy, new URL("https://acme.example/users/sign_in?return=%2F"))).toBe(true);
    expect(check(busy, new URL("https://acme.example/auth/login"))).toBe(true);
    expect(check(busy, new URL("https://acme.example/wp-login.php"))).toBe(true);
  });

  it("is a password form under a login title, with a sidebar of copy", () => {
    expect(check({ ...SIGN_IN, title: "Sign in · Acme", textLength: 2_400, links: 20 })).toBe(true);
    expect(check({ ...SIGN_IN, heading: "Log in to Acme", textLength: 2_400, links: 20 })).toBe(
      true,
    );
  });
});

describe("not a login page", () => {
  it("is a blank page", () => {
    expect(check(BLANK)).toBe(false);
  });

  it("is a marketing page with a login box in its header", () => {
    expect(check({ ...MARKETING, passwordInputs: 1, forms: 2 })).toBe(false);
  });

  it("is a long page with a login title but a whole page of content", () => {
    expect(check({ ...MARKETING, passwordInputs: 1, title: "Log in or explore Acme" })).toBe(false);
  });

  it("is a short page without a visible password field", () => {
    expect(check({ ...SIGN_IN, passwordInputs: 0 })).toBe(false);
    expect(check({ ...SIGN_IN, passwordInputs: 0, title: "Sign in" })).toBe(false);
  });

  it("is a small page with a password field but plenty of links", () => {
    expect(check({ ...SIGN_IN, links: 30 })).toBe(false);
  });

  it("is a page whose path only resembles a login word", () => {
    const article = new URL("https://acme.example/blog/author/signing-in-tips");
    expect(check({ ...MARKETING, passwordInputs: 1 }, article)).toBe(false);
  });

  it("is a login page the reviewer asked for by its address", () => {
    const login = new URL("https://acme.example/login");
    expect(check(SIGN_IN, login, login)).toBe(false);
    const vercel = new URL("https://vercel.com/login");
    expect(check({ heading: "Log in to Vercel" }, vercel, vercel)).toBe(false);
  });
});
