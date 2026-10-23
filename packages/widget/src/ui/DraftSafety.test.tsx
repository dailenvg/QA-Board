import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOST_TAG } from "../core/host";
import { storeToken } from "../core/token";
import { createMemoryClient } from "../mock/memory-client";
import { PinpointProvider } from "./PinpointProvider";
import { reviewTokenStore } from "./hooks/use-review-token";
import { EXIT_DURATION_MS } from "./styles";

function shadow(): ShadowRoot {
  const root = document.querySelector(HOST_TAG)?.shadowRoot;
  if (!root) throw new Error("widget not mounted");
  return root;
}

const query = (selector: string) => shadow().querySelector<HTMLElement>(selector);
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

function press(key: string): void {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, composed: true }),
    );
  });
}

/** Opens the composer through the keyboard path: comment mode, arrow to <main>, Enter. */
async function openComposer(): Promise<HTMLTextAreaElement> {
  render(
    <PinpointProvider enabled client={createMemoryClient()}>
      <main>
        <a href="#elsewhere">A host link</a>
      </main>
    </PinpointProvider>,
  );
  await wait(10);
  act(() => query("button.pp-btn--toggle-primary")?.click());
  press("ArrowDown");
  press("Enter");
  await wait(10);
  const textarea = query("textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("composer did not open");
  return textarea;
}

function composerState(): string | null {
  return query(".pp-popover")?.getAttribute("data-state") ?? null;
}

beforeEach(() => {
  reviewTokenStore.clear();
  storeToken("tok");
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("draft safety", () => {
  it("closes an empty draft on the first Escape", async () => {
    await openComposer();
    press("Escape");
    expect(composerState()).toBe("closed");
  });

  it("asks before discarding a non-empty draft, then discards on the second Escape", async () => {
    const textarea = await openComposer();
    fireEvent.change(textarea, { target: { value: "Make this bigger" } });

    press("Escape");
    expect(composerState()).toBe("open");
    expect(query("[data-testid='pp-discard-notice']")?.textContent).toContain("Press Esc again");
    expect(shadow().textContent).toContain("Press Escape again to discard this comment.");

    press("Escape");
    expect(composerState()).toBe("closed");
    await wait(EXIT_DURATION_MS + 20);
    expect(query(".pp-popover")).toBeNull();
  });

  it("re-arms after the draft changes", async () => {
    const textarea = await openComposer();
    fireEvent.change(textarea, { target: { value: "One" } });
    press("Escape");
    fireEvent.change(textarea, { target: { value: "One two" } });
    expect(query("[data-testid='pp-discard-notice']")).toBeNull();

    press("Escape");
    expect(composerState()).toBe("open");
  });

  it("swallows page clicks while the draft has text and returns focus to it", async () => {
    const textarea = await openComposer();
    fireEvent.change(textarea, { target: { value: "Keep me" } });
    const link = document.querySelector("a");
    if (!link) throw new Error("missing link");

    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });
    act(() => {
      link.dispatchEvent(pointerDown);
      link.dispatchEvent(click);
    });

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    expect(composerState()).toBe("open");
    expect(shadow().activeElement).toBe(textarea);
  });

  it("lets page clicks through and closes an empty draft", async () => {
    await openComposer();
    const link = document.querySelector("a");
    if (!link) throw new Error("missing link");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });

    act(() => {
      link.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true }),
      );
      link.dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(false);
    expect(composerState()).toBe("closed");
  });
});
