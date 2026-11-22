/** What a loaded page shows, read in the page by `LOGIN_SIGNALS_SCRIPT`. Counts are of visible elements. */
export interface LoginSignals {
  title: string;
  /** The first visible `h1`'s text. */
  heading: string;
  passwordInputs: number;
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
  const count = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible).length;
  const heading = Array.from(document.querySelectorAll("h1")).find(visible);
  return {
    title: document.title.trim().slice(0, 200),
    heading: heading ? (heading.textContent || "").trim().slice(0, 200) : "",
    passwordInputs: count('input[type="password"]'),
    forms: count("form"),
    textLength: document.body ? document.body.innerText.trim().length : 0,
    links: count("a[href]"),
  };
})()`;

/** A path segment that names a login page: /login, /sign-in, /users/sign_in, /auth, /wp-login.php. */
const LOGIN_SEGMENT = /^(log-?in|sign[-_]?in|auth|sso|wp-login)(\.\w+)?$/i;
/** A title or heading that asks the visitor to log in ("Sign in · Acme"), not an article about it. */
const LOGIN_WORDS = /\b(log ?in|sign ?in)\b/i;
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

function isLoginPath(url: URL): boolean {
  return url.pathname.split("/").some((segment) => LOGIN_SEGMENT.test(segment));
}

function namesLogin(text: string): boolean {
  return text.length <= LOGIN_TITLE_MAX && LOGIN_WORDS.test(text);
}

function isVercelLogin(final: URL, signals: LoginSignals): boolean {
  if (VERCEL_HEADING.test(signals.title) || VERCEL_HEADING.test(signals.heading)) return true;
  const host = final.hostname.replace(/^www\./, "");
  const first = final.pathname.split("/")[1] ?? "";
  return host === "vercel.com" && VERCEL_LOGIN_PATHS.has(first);
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
 * screen instead of the site: Vercel's deployment protection, or a page that
 * asks for a password and is clearly about it (a login address, a login
 * title, or little else on the page). Errs towards no: a page that only has
 * a login box somewhere is reviewed as usual. An address that is itself a
 * login page was asked for on purpose, so it's never flagged.
 */
export function isLoginPage(requested: URL, final: URL, signals: LoginSignals): boolean {
  if (isLoginPath(requested)) return false;
  if (isVercelLogin(final, signals)) return true;
  if (signals.passwordInputs === 0) return false;
  if (isLoginPath(final)) return true;
  const titled = namesLogin(signals.title) || namesLogin(signals.heading);
  if (titled && signals.textLength <= TITLED_LOGIN_TEXT) return true;
  return isMostlyForm(signals);
}
