import { describe, expect, it } from "vitest";
import { filterClickUpOptions, SHOWN_MAX } from "./clickup-options";

const OPTIONS = [
  { id: "1", label: "Ana Ruiz", detail: "ana@acme.test" },
  { id: "2", label: "Bo Chen", detail: "bo@studio.test" },
  { id: "3", label: "Café crew" },
];

describe("filterClickUpOptions", () => {
  it("shows everything for a blank query", () => {
    expect(filterClickUpOptions(OPTIONS, "  ")).toEqual({ shown: OPTIONS, more: 0 });
  });

  it("matches the label or the detail, ignoring case and accents, in their own order", () => {
    expect(filterClickUpOptions(OPTIONS, "CAFE").shown.map(({ id }) => id)).toEqual(["3"]);
    expect(filterClickUpOptions(OPTIONS, "studio").shown.map(({ id }) => id)).toEqual(["2"]);
    expect(filterClickUpOptions(OPTIONS, "e").shown.map(({ id }) => id)).toEqual(["1", "2", "3"]);
    expect(filterClickUpOptions(OPTIONS, "zzz")).toEqual({ shown: [], more: 0 });
  });

  it("shows at most SHOWN_MAX, counting the rest", () => {
    const many = Array.from({ length: SHOWN_MAX + 7 }, (_, index) => ({
      id: String(index),
      label: `Channel ${index}`,
    }));
    const { shown, more } = filterClickUpOptions(many, "channel");
    expect(shown).toHaveLength(SHOWN_MAX);
    expect(more).toBe(7);
  });
});
