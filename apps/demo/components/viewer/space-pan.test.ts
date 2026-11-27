import { describe, expect, it } from "vitest";
import { canArmPan, spacePresses, type PanArming } from "./space-pan";

const ARMABLE: PanArming = {
  typing: false,
  pressing: false,
  modalOpen: false,
  overflows: true,
  overSurface: true,
};

describe("arming Space-drag", () => {
  it("arms over a surface bigger than the stage", () => {
    expect(canArmPan(ARMABLE)).toBe(true);
  });

  it("leaves Space to a text field while typing", () => {
    expect(canArmPan({ ...ARMABLE, typing: true })).toBe(false);
  });

  it("leaves Space to a focused button, checkbox or menu item", () => {
    expect(canArmPan({ ...ARMABLE, pressing: true })).toBe(false);
  });

  it("stays off under a modal dialog", () => {
    expect(canArmPan({ ...ARMABLE, modalOpen: true })).toBe(false);
  });

  it("stays off with nowhere to move to, or with the pointer off the surface", () => {
    expect(canArmPan({ ...ARMABLE, overflows: false })).toBe(false);
    expect(canArmPan({ ...ARMABLE, overSurface: false })).toBe(false);
  });
});

describe("spacePresses", () => {
  it("is true for what Space presses, ticks or opens", () => {
    expect(spacePresses({ tagName: "BUTTON", role: null })).toBe(true);
    expect(spacePresses({ tagName: "summary", role: null })).toBe(true);
    expect(spacePresses({ tagName: "DIV", role: "menuitemradio" })).toBe(true);
    expect(spacePresses({ tagName: "SPAN", role: "switch" })).toBe(true);
  });

  it("is false for the comment canvas, the stage and the page", () => {
    expect(spacePresses({ tagName: "DIV", role: "application" })).toBe(false);
    expect(spacePresses({ tagName: "MAIN", role: null })).toBe(false);
    expect(spacePresses({ tagName: "BODY", role: null })).toBe(false);
    expect(spacePresses(null)).toBe(false);
  });
});
