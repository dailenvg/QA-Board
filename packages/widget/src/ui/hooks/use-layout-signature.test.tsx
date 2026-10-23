import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToLayout, useLayoutSignature } from "./use-layout-signature";

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

function scrollBurst(times: number): void {
  for (let i = 0; i < times; i += 1) window.dispatchEvent(new Event("scroll"));
}

afterEach(() => {
  cleanup();
});

describe("subscribeToLayout", () => {
  it("coalesces a burst of events into one call per frame", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLayout(listener);
    await nextFrame();
    listener.mockClear();

    scrollBurst(25);
    document.body.setAttribute("style", "padding: 1px");
    await nextFrame();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    document.body.removeAttribute("style");
  });

  it("ignores attribute changes that cannot affect layout", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLayout(listener);
    await nextFrame();
    listener.mockClear();

    document.body.setAttribute("data-theme", "dark");
    document.body.setAttribute("aria-busy", "true");
    await nextFrame();
    await nextFrame();

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("useLayoutSignature", () => {
  function Probe({ measure, onRender }: { measure: () => string; onRender: () => void }) {
    onRender();
    useLayoutSignature(measure);
    return null;
  }

  it("does not re-render when nothing measured has moved", async () => {
    const onRender = vi.fn();
    render(<Probe measure={() => "same"} onRender={onRender} />);
    await nextFrame();
    const renders = onRender.mock.calls.length;

    scrollBurst(10);
    await nextFrame();
    scrollBurst(10);
    await nextFrame();

    expect(onRender).toHaveBeenCalledTimes(renders);
  });

  it("re-renders once when the measurement changes", async () => {
    let value = "a";
    const onRender = vi.fn();
    render(<Probe measure={() => value} onRender={onRender} />);
    await nextFrame();
    const renders = onRender.mock.calls.length;

    value = "b";
    scrollBurst(10);
    await nextFrame();

    expect(onRender).toHaveBeenCalledTimes(renders + 1);
  });
});
