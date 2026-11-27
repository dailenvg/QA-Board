import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Zoom } from "./stage-zoom";
import { zoomMenuItems } from "./zoom-menu";
import { ZoomControl } from "./ZoomControl";

const noop = () => {};

function control(
  zoom: Zoom,
  effective: number | null,
  shown = true,
  announced: number | null = null,
): string {
  return renderToStaticMarkup(
    createElement(ZoomControl, {
      shown,
      zoom,
      effective,
      announced,
      onZoomIn: noop,
      onZoomOut: noop,
      onZoomTo: noop,
    }),
  );
}

/** The opening tag of the element with `testId`. */
function tag(html: string, testId: string): string {
  return new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? "missing";
}

const disabled = (html: string, testId: string) =>
  tag(html, testId).includes('aria-disabled="true"');

describe("the zoom control", () => {
  it("shows zoom out, the level and zoom in, at Fit too", () => {
    const html = control("fit", 0.5);
    expect(tag(html, "zoom-out")).toContain('aria-label="Zoom out"');
    expect(tag(html, "zoom-in")).toContain('aria-label="Zoom in"');
    expect(tag(html, "zoom-level")).toContain('aria-label="Zoom, fit width"');
    expect(tag(html, "zoom-level")).toContain('aria-haspopup="menu"');
    expect(html).toMatch(/data-testid="zoom-level"[^>]*>(?:<[^>]*>)*Fit</);
  });

  it("names a numeric level by its percentage", () => {
    const html = control(2, 2);
    expect(tag(html, "zoom-level")).toContain('aria-label="Zoom, 200%"');
    expect(html).toMatch(/data-testid="zoom-level"[^>]*>(?:<[^>]*>)*200%</);
  });

  it("says the level a zoom landed on to screen readers", () => {
    expect(control("fit", 0.457, true, 0.457)).toMatch(/data-testid="zoom-status"[^>]*>Zoom 46%</);
    expect(control(1, 1, true, 1)).toMatch(/data-testid="zoom-status"[^>]*>Zoom 100%</);
  });

  it("says nothing of a level no zoom was asked for, such as a Fit that moved", () => {
    expect(control("fit", 0.457)).toMatch(/data-testid="zoom-status"[^>]*><\/p>/);
    expect(control("fit", 0.5, true, 0.457)).toMatch(/data-testid="zoom-status"[^>]*>Zoom 46%</);
  });

  it("makes the button past a limit unavailable, keeping it focusable", () => {
    const top = control(4, 4);
    expect(disabled(top, "zoom-in")).toBe(true);
    expect(disabled(top, "zoom-out")).toBe(false);
    const bottom = control(0.25, 0.25);
    expect(disabled(bottom, "zoom-out")).toBe(true);
    expect(disabled(bottom, "zoom-in")).toBe(false);
    expect(tag(bottom, "zoom-out")).not.toMatch(/\sdisabled(?:=""|\s|>)/);
  });

  it("only zooms in from a Fit below 25%", () => {
    const html = control("fit", 0.1);
    expect(disabled(html, "zoom-out")).toBe(true);
    expect(disabled(html, "zoom-in")).toBe(false);
  });

  it("keeps both buttons unavailable until the level is known", () => {
    const html = control("fit", null);
    expect(disabled(html, "zoom-in")).toBe(true);
    expect(disabled(html, "zoom-out")).toBe(true);
  });

  it("isn't there on a stage it can't zoom", () => {
    expect(control("fit", null, false)).toBe("");
  });
});

describe("the zoom level menu", () => {
  it("offers Fit width and set levels, the current one checked", () => {
    const items = zoomMenuItems(1, noop);
    expect(items.map((item) => item.label)).toEqual(["Fit width", "50%", "100%", "200%", "400%"]);
    expect(items.filter((item) => item.checked).map((item) => item.label)).toEqual(["100%"]);
    expect(zoomMenuItems("fit", noop)[0]?.checked).toBe(true);
  });

  it("checks none at a level between them, as the wheel leaves it", () => {
    expect(zoomMenuItems(1.37, noop).some((item) => item.checked)).toBe(false);
  });

  it("zooms to the level picked", () => {
    const onZoomTo = vi.fn();
    const items = zoomMenuItems("fit", onZoomTo);
    items[0]?.onSelect?.();
    items[3]?.onSelect?.();
    expect(onZoomTo.mock.calls).toEqual([["fit"], [2]]);
  });
});
