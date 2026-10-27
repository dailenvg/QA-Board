/** The message a framed page posts to its parent, so a review tool can follow it. */
export const LOCATION_MESSAGE = "squint:location";

export interface LocationMessage {
  type: typeof LOCATION_MESSAGE;
  href: string;
}

export interface ReportLocationOptions {
  /**
   * Who may read the address: the review tool's origin, such as
   * `https://squint.example`. Set it: the default, `"*"`, sends the full
   * address, query included, to any page that frames this one.
   */
  targetOrigin?: string;
  /** The window to report on; `window` by default (tests pass their own). */
  win?: Window;
}

type HistoryMethod = "pushState" | "replaceState";
const METHODS: readonly HistoryMethod[] = ["pushState", "replaceState"];

/**
 * When this page is shown inside a frame, tells the parent which page it's on:
 * once now, then after every client-side navigation (`history.pushState`,
 * `replaceState`, back and forward). Does nothing on a page that isn't
 * framed. Returns a function that stops reporting.
 *
 * Only `{ type: "squint:location", href }` is sent; a parent should still
 * check `event.source` and `event.origin` before believing it.
 */
export function reportLocation({ targetOrigin = "*", win = window }: ReportLocationOptions = {}) {
  if (win.parent === win) return () => undefined;
  let last: string | null = null;
  const post = () => {
    const { href } = win.location;
    if (href === last) return;
    last = href;
    const message: LocationMessage = { type: LOCATION_MESSAGE, href };
    win.parent.postMessage(message, targetOrigin);
  };

  const history = win.history;
  const wrapped = METHODS.map((name) => {
    const own = Object.getOwnPropertyDescriptor(history, name);
    const call = history[name].bind(history);
    const wrapper = (data: unknown, unused: string, url?: string | URL | null) => {
      call(data, unused, url);
      post();
    };
    Object.defineProperty(history, name, { value: wrapper, configurable: true, writable: true });
    return { name, own, wrapper };
  });
  win.addEventListener("popstate", post);
  post();

  return () => {
    win.removeEventListener("popstate", post);
    for (const { name, own, wrapper } of wrapped) {
      // Someone may have wrapped it after us; leave theirs in place rather than drop it.
      if (Object.getOwnPropertyDescriptor(history, name)?.value !== wrapper) continue;
      if (own) Object.defineProperty(history, name, own);
      else Reflect.deleteProperty(history, name);
    }
  };
}
