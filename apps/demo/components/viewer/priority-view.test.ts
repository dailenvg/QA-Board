import { describe, expect, it } from "vitest";
import type { CommentPriority } from "@/lib/store/types";
import {
  DEFAULT_VIEW,
  filterByPriority,
  filteredOutTitle,
  isDefaultView,
  priorityChangeNote,
  showsPriority,
  sortComments,
} from "./priority-view";

const comment = (id: string, priority?: CommentPriority) => ({
  id,
  ...(priority ? { priority } : {}),
});

/** Pins 1 to 6, in pin order. */
const COMMENTS = [
  comment("c1"),
  comment("c2", "nit"),
  comment("c3", "must"),
  comment("c4", "should"),
  comment("c5", "must"),
  comment("c6"),
];
const NUMBERS = new Map(COMMENTS.map((entry, index) => [entry.id, index + 1]));
const ids = (list: ReadonlyArray<{ id: string }>) => list.map((entry) => entry.id);

describe("showsPriority", () => {
  it("shows everything for all, one priority's for it, and only the unmarked for none", () => {
    expect(showsPriority(undefined, "all")).toBe(true);
    expect(showsPriority("nit", "all")).toBe(true);
    expect(showsPriority("must", "must")).toBe(true);
    expect(showsPriority("should", "must")).toBe(false);
    expect(showsPriority(undefined, "must")).toBe(false);
    expect(showsPriority(undefined, "none")).toBe(true);
    expect(showsPriority("nit", "none")).toBe(false);
  });
});

describe("filterByPriority", () => {
  it("keeps the order, and the very list when it shows all", () => {
    expect(filterByPriority(COMMENTS, "all")).toBe(COMMENTS);
    expect(ids(filterByPriority(COMMENTS, "must"))).toEqual(["c3", "c5"]);
    expect(ids(filterByPriority(COMMENTS, "should"))).toEqual(["c4"]);
    expect(ids(filterByPriority(COMMENTS, "nit"))).toEqual(["c2"]);
    expect(ids(filterByPriority(COMMENTS, "none"))).toEqual(["c1", "c6"]);
  });
});

describe("sortComments", () => {
  it("leaves pin order as it is", () => {
    expect(sortComments(COMMENTS, "pin", NUMBERS)).toBe(COMMENTS);
  });

  it("puts Must fix, Should fix, Nit, then none first, each by pin number (D11)", () => {
    expect(ids(sortComments(COMMENTS, "priority", NUMBERS))).toEqual([
      "c3",
      "c5",
      "c4",
      "c2",
      "c1",
      "c6",
    ]);
  });

  it("orders by pin number, not by the list's order, and never changes the list", () => {
    const shuffled = [COMMENTS[4], COMMENTS[2], COMMENTS[5], COMMENTS[0]].flatMap((entry) =>
      entry ? [entry] : [],
    );
    expect(ids(sortComments(shuffled, "priority", NUMBERS))).toEqual(["c3", "c5", "c1", "c6"]);
    expect(ids(shuffled)).toEqual(["c5", "c3", "c6", "c1"]);
  });
});

describe("the view", () => {
  it("is default only with pin order and every priority", () => {
    expect(isDefaultView(DEFAULT_VIEW)).toBe(true);
    expect(isDefaultView({ sort: "priority", filter: "all" })).toBe(false);
    expect(isDefaultView({ sort: "pin", filter: "nit" })).toBe(false);
  });

  it("names what a filter hid", () => {
    expect(filteredOutTitle("must")).toBe("No Must fix comments here");
    expect(filteredOutTitle("should")).toBe("No Should fix comments here");
    expect(filteredOutTitle("nit")).toBe("No Nit comments here");
    expect(filteredOutTitle("none")).toBe("No comments without a priority here");
  });
});

describe("priorityChangeNote", () => {
  it("says which comment got which priority, or that it has none now", () => {
    expect(priorityChangeNote(1, "nit")).toBe("Comment 1 marked Nit.");
    expect(priorityChangeNote(3, "must")).toBe("Comment 3 marked Must fix.");
    expect(priorityChangeNote(12, "should")).toBe("Comment 12 marked Should fix.");
    expect(priorityChangeNote(3, null)).toBe("Comment 3 has no priority now.");
  });
});
