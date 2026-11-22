import { describe, expect, it } from "vitest";
import { isLoginPage, type LoginSignals } from "./login-page";

/** A blank page: no title, no text, nothing to fill in. */
const BLANK: LoginSignals = {
  title: "",
  heading: "",
  passwordInputs: 0,
  newPasswordInputs: 0,
  fields: 0,
  forms: 0,
  textLength: 0,
  links: 0,
};

/** A typical sign-in page: one form, an email and a password field, a few links. */
const SIGN_IN: LoginSignals = {
  title: "Acme",
  heading: "Welcome back",
  passwordInputs: 1,
  newPasswordInputs: 0,
  fields: 1,
  forms: 1,
  textLength: 240,
  links: 4,
};

/** A long marketing page. */
const MARKETING: LoginSignals = {
  title: "Acme: dashboards your team will love",
  heading: "Ship dashboards in minutes",
  passwordInputs: 0,
  newPasswordInputs: 0,
  fields: 0,
  forms: 1,
  textLength: 6_400,
  links: 48,
};

const SITE = new URL("https://acme.example/");

function check(signals: Partial<LoginSignals>, final = SITE, requested = SITE): boolean {
  return isLoginPage(requested, final, { ...BLANK, ...signals });
}

/** A capture asked for, and ending on, `address`. */
function at(signals: Partial<LoginSignals>, address: string): boolean {
  const url = new URL(address);
  return check(signals, url, url);
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

  it("is a login page when a preview's own login address sends it to Vercel's", () => {
    const requested = new URL("https://app-git-x-team.vercel.app/login");
    const login = new URL("https://vercel.com/login?next=%2Fsso-api");
    expect(check({ heading: "Log in to Vercel" }, login, requested)).toBe(true);
  });

  it("is a login page when the page says 'Log in to Vercel', wherever it is", () => {
    expect(check({ heading: "Log in to Vercel", links: 8 }, deployment, deployment)).toBe(true);
    expect(check({ title: "Log in to Vercel" }, deployment, deployment)).toBe(true);
  });

  it("is a login page behind Vercel's password protection: one password, little else", () => {
    const gate = {
      title: "Password Protected",
      heading: "This deployment is password protected",
      passwordInputs: 1,
      forms: 1,
      textLength: 53,
      links: 1,
    };
    expect(check(gate, deployment, deployment)).toBe(true);
  });

  it("isn't vercel.com's own pages, nor an article about logging in to it", () => {
    expect(check({ ...MARKETING, title: "Vercel" }, new URL("https://vercel.com/"))).toBe(false);
    expect(check({ ...MARKETING, title: "How to log in to Vercel from the CLI" })).toBe(false);
  });
});

describe("a generic login page", () => {
  it("is a page that's little besides a sign-in form", () => {
    expect(check(SIGN_IN)).toBe(true);
  });

  it("is a sign-in form the capture was redirected to a login address for", () => {
    const busy = { ...SIGN_IN, textLength: 5_000, links: 40 };
    expect(check(busy, new URL("https://acme.example/users/sign_in?return=%2F"))).toBe(true);
    expect(check(busy, new URL("https://acme.example/auth/login"))).toBe(true);
    expect(check(busy, new URL("https://acme.example/wp-login.php"))).toBe(true);
  });

  it("is a sign-in form under a login title, with a sidebar of copy", () => {
    const sidebar = { ...SIGN_IN, textLength: 2_400, links: 20 };
    expect(check({ ...sidebar, title: "Sign in · Acme" })).toBe(true);
    expect(check({ ...sidebar, title: "Sign-in · Acme" })).toBe(true);
    expect(check({ ...sidebar, heading: "Log in to Acme" })).toBe(true);
  });

  it("is a login wall that an account or sign-up address redirected to", () => {
    const login = new URL("https://acme.example/login?next=%2Faccount");
    expect(check(SIGN_IN, login, new URL("https://acme.example/account"))).toBe(true);
    expect(check(SIGN_IN, login, new URL("https://acme.example/signup"))).toBe(true);
  });
});

describe("not a login page", () => {
  it("is a blank page", () => {
    expect(check(BLANK)).toBe(false);
  });

  it("is a marketing page with a login box in its header", () => {
    expect(check({ ...MARKETING, passwordInputs: 1, fields: 1, forms: 2 })).toBe(false);
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

  it("is a page asking for a password twice: reset, or current and new in settings", () => {
    const reset = { ...SIGN_IN, title: "Reset password", passwordInputs: 2, fields: 0 };
    expect(check(reset)).toBe(false);
    expect(check({ ...reset, title: "Account settings · Acme", heading: "Security" })).toBe(false);
    expect(check(reset, new URL("https://acme.example/login/reset"))).toBe(false);
  });

  it("is a page whose every password field is for choosing a new one", () => {
    expect(check({ ...SIGN_IN, newPasswordInputs: 1 })).toBe(false);
    expect(check({ ...SIGN_IN, title: "Sign in or join", newPasswordInputs: 1 })).toBe(false);
  });

  it("is a sign-up or checkout form, which asks for more than a name and a password", () => {
    const signup = { ...SIGN_IN, title: "Create your account · Acme", fields: 2, textLength: 94 };
    expect(check(signup)).toBe(false);
    const checkout = { ...SIGN_IN, title: "Checkout", fields: 2, textLength: 630, links: 1 };
    expect(check(checkout, new URL("https://acme.example/checkout"))).toBe(false);
  });

  it("is a login page the reviewer asked for by its address", () => {
    expect(at(SIGN_IN, "https://acme.example/login")).toBe(false);
    expect(at(SIGN_IN, "https://acme.example/login/")).toBe(false);
    expect(at({ heading: "Log in to Vercel" }, "https://vercel.com/login")).toBe(false);
  });

  it("is a sign-up, join, reset or account page the reviewer asked for by its address", () => {
    for (const path of [
      "signup",
      "sign-up",
      "register",
      "join",
      "reset",
      "reset-password",
      "forgot-password",
      "password",
      "account",
    ]) {
      expect(at(SIGN_IN, `https://acme.example/${path}?ref=nav`)).toBe(false);
    }
  });
});

describe("a page's signals", () => {
  it("never throw, whatever the page sent back", () => {
    const hostile = { title: { trim: () => null }, heading: null, passwordInputs: "1" };
    expect(isLoginPage(SITE, SITE, hostile)).toBe(false);
    expect(isLoginPage(SITE, SITE, null)).toBe(false);
    expect(isLoginPage(SITE, SITE, "Log in to Vercel")).toBe(false);
  });

  it("still find Vercel's login by address when the rest is junk", () => {
    expect(isLoginPage(SITE, new URL("https://vercel.com/login"), { title: 42 })).toBe(true);
  });
});
