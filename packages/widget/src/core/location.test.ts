import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCATION_MESSAGE, reportLocation } from "./location";

/** This test window, as if it were shown inside a frame whose parent records what it's told. */
function framed() {
  const postMessage = vi.fn();
  const win = {
    parent: { postMessage },
    location: window.location,
    history: window.history,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
  } as unknown as Window;
  const hrefs = () =>
    postMessage.mock.calls.map(([message]) =>
      (message as { href: string }).href.replace(/^.*?\/\/[^/]+/, ""),
    );
  return { win, postMessage, hrefs };
}

/** Whether something has wrapped this window's `history.pushState` / `replaceState`. */
const wrapped = (name: "pushState" | "replaceState") => Object.hasOwn(window.history, name);

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("reportLocation", () => {
  it("does nothing on a page that isn't framed", () => {
    const stop = reportLocation({ win: window });
    expect(wrapped("pushState")).toBe(false);
    stop();
  });

  it("reports the page now and after each client-side navigation, once per address", () => {
    window.history.replaceState(null, "", "/start");
    const { win, postMessage, hrefs } = framed();
    const stop = reportLocation({ win, targetOrigin: "https://squint.example" });
    window.history.pushState(null, "", "/pricing");
    window.history.replaceState(null, "", "/pricing");
    window.history.replaceState(null, "", "/pricing?plan=pro");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(hrefs()).toEqual(["/start", "/pricing", "/pricing?plan=pro"]);
    expect(postMessage).toHaveBeenCalledWith(
      { type: LOCATION_MESSAGE, href: window.location.href },
      "https://squint.example",
    );
    stop();
  });

  it("posts to any framing page by default, and stops when asked", () => {
    const { win, postMessage } = framed();
    const stop = reportLocation({ win });
    expect(postMessage).toHaveBeenLastCalledWith(expect.anything(), "*");
    expect(wrapped("pushState") && wrapped("replaceState")).toBe(true);
    stop();
    expect(wrapped("pushState") || wrapped("replaceState")).toBe(false);
    window.history.pushState(null, "", "/after");
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
