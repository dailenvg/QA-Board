/** What a loaded page shows, read in the page by `LOGIN_SIGNALS_SCRIPT`. Counts are of visible elements. */
export interface LoginSignals {
  title: string;
  /** The first visible `h1`'s text. */
  heading: string;
  passwordInputs: number;
  /** Password fields for choosing a password (`autocomplete="new-password"`): sign-up, reset, settings. */
  newPasswordInputs: number;
  /** Other fields to fill in (text, email, select…) in the first password field's form. */
  fields: number;
  forms: number;
  /** Characters of rendered text (`innerText`, so hidden text isn't counted). */
  textLength: number;
  links: number;
}

/**
 * Reads `LoginSignals` in the page. A string, like the other page scripts,
 * so bundlers can't rewrite it into something the page can't run. Visible:
 * rendered, not `visibility: hidden` or transparent, and with a size (a
 * zero-size password field is an autofill trap, not a login box).
 */
export const LOGIN_SIGNALS_SCRIPT = `(() => {
  const visible = (el) => {
    const shown = typeof el.checkVisibility === "function"
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true;
    const box = el.getBoundingClientRect();
    return shown && box.width > 0 && box.height > 0;
  };
  const all = (selector, scope = document) =>
    Array.from(scope.querySelectorAll(selector)).filter(visible);
  const text = (value) => String(value || "").trim().slice(0, 200);
  const passwords = all('input[type="password"]');
  const fieldScope = (passwords[0] && passwords[0].form) || document;
  const heading = all("h1")[0];
  return {
    title: text(document.title),
    heading: heading ? text(heading.textContent) : "",
    passwordInputs: passwords.length,
    newPasswordInputs: passwords.filter((el) => /new-password/i.test(el.autocomplete || "")).length,
    fields: all(
      'input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"]):not([type="range"]):not([type="color"]), select, textarea',
      fieldScope,
    ).length,
    forms: all("form").length,
    textLength: document.body ? document.body.innerText.trim().length : 0,
    links: all("a[href]").length,
  };
})()`;

/** A path segment that names a login page: /login, /sign-in, /users/sign_in, /auth, /wp-login.php. */
const LOGIN_SEGMENT = /^(log-?in|sign[-_]?in|auth|sso|wp-login)(\.\w+)?$/i;
/**
 * A path segment for a page that asks for a password without being a login wall:
 * signing up, joining, resetting a password, account settings.
 */
const ACCOUNT_SEGMENT =
  /^(sign[-_]?up|register|join|reset(-password)?|forgot(-password)?|password|account)(\.\w+)?$/i;
/** A title or heading that asks the visitor to log in ("Sign in · Acme"), not an article about it. */
const LOGIN_WORDS = /\b(log[- ]?in|sign[- ]?in)\b/i;
const LOGIN_TITLE_MAX = 80;
/** The heading (and title) of Vercel's login page, exactly. */
const VERCEL_HEADING = /^log in to vercel$/i;
/** Where Vercel's deployment protection sends a visitor who isn't signed in to Vercel. */
const VERCEL_LOGIN_PATHS = new Set(["login", "sso-api"]);

/**
 * A page that is little besides its form: few forms, little text, few links.
 * A marketing page with a login box in its header has far more of each.
 */
const MOSTLY_FORM = { forms: 2, textLength: 1_000, links: 10 } as const;
/** A login page whose title says so may carry a sidebar of copy, but not a whole page of it. */
const TITLED_LOGIN_TEXT = 3_000;
/** A sign-in form asks for a name or email at most besides the password; sign-up and checkout ask more. */
const SIGN_IN_FIELDS = 1;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The page's answer as `LoginSignals`, whatever it sent back: a page can redefine what the script reads. */
function readSignals(raw: unknown): LoginSignals {
  const value: Partial<Record<keyof LoginSignals, unknown>> =
    typeof raw === "object" && raw !== null ? raw : {};
  return {
    title: text(value.title),
    heading: text(value.heading),
    passwordInputs: count(value.passwordInputs),
    newPasswordInputs: count(value.newPasswordInputs),
    fields: count(value.fields),
    forms: count(value.forms),
    textLength: count(value.textLength),
    links: count(value.links),
  };
}

function hasSegment(url: URL, pattern: RegExp): boolean {
  return url.pathname.split("/").some((segment) => pattern.test(segment));
}

/** The same page, give or take a query or a trailing slash. */
function samePage(a: URL, b: URL): boolean {
  const path = (url: URL) => url.pathname.replace(/\/+$/, "");
  return a.origin === b.origin && path(a) === path(b);
}

/**
 * The capture ended on the page it was asked for, and that page's address
 * says it's a login, sign-up or account page: the reviewer wants that page.
 */
function askedForOnPurpose(requested: URL, final: URL): boolean {
  if (!samePage(requested, final)) return false;
  return hasSegment(requested, LOGIN_SEGMENT) || hasSegment(requested, ACCOUNT_SEGMENT);
}

function namesLogin(value: string): boolean {
  return value.length <= LOGIN_TITLE_MAX && LOGIN_WORDS.test(value);
}

function isVercelLogin(final: URL, signals: LoginSignals): boolean {
  if (VERCEL_HEADING.test(signals.title) || VERCEL_HEADING.test(signals.heading)) return true;
  const host = final.hostname.replace(/^www\./, "");
  const first = final.pathname.split("/")[1] ?? "";
  return host === "vercel.com" && VERCEL_LOGIN_PATHS.has(first);
}

/**
 * One password field that isn't for choosing a password, in a short form.
 * Two (current and new, or password and confirm) means sign-up, reset or
 * settings; more fields means sign-up or checkout.
 */
function isSignInForm(signals: LoginSignals): boolean {
  return (
    signals.passwordInputs === 1 &&
    signals.newPasswordInputs === 0 &&
    signals.fields <= SIGN_IN_FIELDS
  );
}

function isMostlyForm(signals: LoginSignals): boolean {
  return (
    signals.forms <= MOSTLY_FORM.forms &&
    signals.textLength <= MOSTLY_FORM.textLength &&
    signals.links <= MOSTLY_FORM.links
  );
}

/**
 * Whether a capture of `requested` that ended on `final` showed a login
 * screen instead of the site: Vercel's deployment protection, or a sign-in
 * form that's clearly the page's point (a login address, a login title, or
 * little else on the page). Errs towards no: a page that only has a login
 * box somewhere, or asks for a new password, is reviewed as usual. So is a
 * login or account page the reviewer asked for by its address.
 */
export function isLoginPage(requested: URL, final: URL, raw: unknown): boolean {
  if (askedForOnPurpose(requested, final)) return false;
  const signals = readSignals(raw);
  if (isVercelLogin(final, signals)) return true;
  if (!isSignInForm(signals)) return false;
  if (hasSegment(final, LOGIN_SEGMENT)) return true;
  const titled = namesLogin(signals.title) || namesLogin(signals.heading);
  if (titled && signals.textLength <= TITLED_LOGIN_TEXT) return true;
  return isMostlyForm(signals);
}
