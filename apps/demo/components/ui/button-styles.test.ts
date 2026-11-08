import { describe, expect, it } from "vitest";
import { buttonClass } from "./button-styles";

describe("buttonClass", () => {
  it("gives the danger ghost its red label and nothing of the ghost's ink", () => {
    const classes = buttonClass("danger-ghost", "sm").split(" ");
    expect(classes).toContain("text-danger");
    expect(classes).not.toContain("text-ink");
  });
});
