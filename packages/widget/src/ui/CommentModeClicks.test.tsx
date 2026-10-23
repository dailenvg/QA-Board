import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOST_TAG } from "../core/host";
import { storeToken } from "../core/token";
import { createMemoryClient } from "../mock/memory-client";
import { isKeyboardClick, KEYBOARD_CLICK_WINDOW_MS } from "./hooks/use-comment-mode";
import { PinpointProvider } from "./PinpointProvider";
import { reviewTokenStore } from "./hooks/use-review-token";

const shadow = () => document.querySelector(HOST_TAG)?.shadowRoot ?? null;
const composerOpen = () => shadow()?.querySelector(".pp-popover[data-state='open']") != null;

async function enterCommentMode(onPageClick: () => void): Promise<HTMLButtonElement> {
  render(
    <PinpointProvider enabled client={createMemoryClient()}>
      <main>
        <button type="button" onClick={onPageClick}>
          Buy
        </button>
        <span tabIndex={0}>Other</span>
      </main>
    </PinpointProvider>,
  );
  await waitFor(() => expect(shadow()?.querySelector(".pp-count")).toBeTruthy());
  act(() => shadow()?.querySelector<HTMLButtonElement>("button.pp-btn--toggle-primary")?.click());
  const button = document.querySelector("main button");
  if (!(button instanceof HTMLButtonElement)) throw new Error("missing page button");
  return button;
}

function keydown(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
  });
}

beforeEach(() => {
  reviewTokenStore.clear();
  storeToken("tok");
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("comment mode clicks", () => {
  it("swallows programmatic element.click() without creating a pin", async () => {
    const onPageClick = vi.fn();
    const button = await enterCommentMode(onPageClick);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });
    act(() => {
      button.click();
      button.dispatchEvent(click);
    });

    expect(onPageClick).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
    expect(composerOpen()).toBe(false);
  });

  it("pins the control when Space on it produced the click", async () => {
    const onPageClick = vi.fn();
    const button = await enterCommentMode(onPageClick);

    keydown(button, " ");
    act(() => button.click());

    expect(onPageClick).not.toHaveBeenCalled();
    await waitFor(() => expect(composerOpen()).toBe(true));
  });

  it("ignores a key press on a different element", async () => {
    const button = await enterCommentMode(vi.fn());
    const other = document.querySelector("main span");
    if (!other) throw new Error("missing element");

    keydown(other, " ");
    act(() => button.click());

    expect(composerOpen()).toBe(false);
  });
});

describe("isKeyboardClick", () => {
  const target = {} as EventTarget;

  it("accepts a detail-0 click right after Enter or Space on the same target", () => {
    expect(
      isKeyboardClick({ detail: 0, target }, { target, at: 1000 }, 1000 + KEYBOARD_CLICK_WINDOW_MS),
    ).toBe(true);
  });

  it("rejects stale activations, other targets, missing activations and real pointer clicks", () => {
    expect(isKeyboardClick({ detail: 0, target }, { target, at: 1000 }, 1501)).toBe(false);
    expect(
      isKeyboardClick({ detail: 0, target }, { target: {} as EventTarget, at: 1000 }, 1100),
    ).toBe(false);
    expect(isKeyboardClick({ detail: 0, target }, null, 1000)).toBe(false);
    expect(isKeyboardClick({ detail: 1, target }, { target, at: 1000 }, 1000)).toBe(false);
  });
});
