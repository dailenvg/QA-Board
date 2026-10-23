import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinpointUnauthorizedError, type PinpointClient } from "../core/client";
import { HOST_TAG } from "../core/host";
import { storeToken, TOKEN_STORAGE_KEY, TOKEN_TTL_MS } from "../core/token";
import { pinFixture } from "../test/fixtures";
import { PinpointProvider } from "./PinpointProvider";
import { reviewTokenStore } from "./hooks/use-review-token";

function spyClient(listPins = vi.fn<PinpointClient["listPins"]>().mockResolvedValue([])) {
  const createPin = vi.fn<PinpointClient["createPin"]>().mockResolvedValue(pinFixture());
  const client: PinpointClient = {
    listPins,
    createPin,
    addReply: vi.fn<PinpointClient["addReply"]>().mockResolvedValue(pinFixture()),
    resolvePin: vi.fn<PinpointClient["resolvePin"]>().mockResolvedValue(pinFixture()),
  };
  return { client, listPins, createPin };
}

function host(): HTMLElement | null {
  return document.querySelector(HOST_TAG);
}

function shadowText(): string {
  return host()?.shadowRoot?.textContent ?? "";
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  reviewTokenStore.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("PinpointProvider", () => {
  it("renders children and nothing else when disabled", async () => {
    window.history.replaceState(null, "", "/?review=tok");
    const { client, listPins } = spyClient();
    render(
      <PinpointProvider client={client}>
        <p>App</p>
      </PinpointProvider>,
    );
    await settle();

    expect(screen.getByText("App")).toBeTruthy();
    expect(host()).toBeNull();
    expect(listPins).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?review=tok");
  });

  it("stays invisible and makes zero client calls without a token", async () => {
    const { client, listPins, createPin } = spyClient();
    render(
      <PinpointProvider enabled client={client}>
        <p>App</p>
      </PinpointProvider>,
    );
    await settle();

    expect(host()).toBeNull();
    expect(listPins).not.toHaveBeenCalled();
    expect(createPin).not.toHaveBeenCalled();
  });

  it("makes zero client calls when the remembered token has expired", async () => {
    storeToken("stale", Date.now() - TOKEN_TTL_MS - 1);
    const { client, listPins } = spyClient();
    render(<PinpointProvider enabled client={client} />);
    await settle();

    expect(host()).toBeNull();
    expect(listPins).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("uses a remembered token from an earlier visit", async () => {
    storeToken("remembered");
    const { client, listPins } = spyClient();
    render(<PinpointProvider enabled client={client} />);
    await settle();

    expect(listPins).toHaveBeenCalledWith("remembered", { path: "/" });
  });

  it("captures the token, strips it, and loads pins for the page", async () => {
    window.history.replaceState(null, "", "/pricing?review=tok");
    const { client, listPins } = spyClient(
      vi.fn<PinpointClient["listPins"]>().mockResolvedValue([pinFixture({ path: "/pricing" })]),
    );
    render(<PinpointProvider enabled client={client} branch="feat/pins" />);
    await settle();

    expect(window.location.search).toBe("");
    expect(listPins).toHaveBeenCalledWith("tok", { path: "/pricing" });
    expect(host()?.shadowRoot).toBeTruthy();
    await waitFor(() => expect(shadowText()).toContain("1 open comment on this page"));
    expect(shadowText()).toContain("feat/pins");
  });

  it("clears the token and hides itself on 401", async () => {
    storeToken("revoked");
    const { client, listPins } = spyClient(
      vi.fn<PinpointClient["listPins"]>().mockRejectedValue(new PinpointUnauthorizedError()),
    );
    render(<PinpointProvider enabled client={client} />);
    await settle();

    expect(listPins).toHaveBeenCalledOnce();
    await waitFor(() => expect(host()).toBeNull());
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("shows a retry action when loading fails", async () => {
    storeToken("tok");
    const listPins = vi
      .fn<PinpointClient["listPins"]>()
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValue([]);
    render(<PinpointProvider enabled client={spyClient(listPins).client} />);
    await settle();

    const retry = host()?.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[aria-label="Retry loading comments"]',
    );
    expect(retry).toBeTruthy();
    act(() => retry?.click());
    await settle();
    expect(listPins).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(shadowText()).toContain("0 open comments"));
  });
});
