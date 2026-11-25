import { describe, expect, it } from "vitest";
import { revealsNewReply } from "./thread-scroll";

/** A stand-in for the reply box: it holds its own field and nothing else. */
const field = { id: "field" } as unknown as Node;
const elsewhere = { id: "popover" } as unknown as Node;
const composer = { contains: (node: Node | null) => node === field };

describe("revealsNewReply", () => {
  it("leaves a thread being read where it is when someone else's reply arrives", () => {
    expect(revealsNewReply(false, composer, elsewhere)).toBe(false);
    expect(revealsNewReply(false, composer, null)).toBe(false);
    // Where there's no box (a guest under a resolved comment), others' replies never move them.
    expect(revealsNewReply(false, null, elsewhere)).toBe(false);
  });

  it("brings one's own new reply into view, wherever focus is", () => {
    expect(revealsNewReply(true, composer, elsewhere)).toBe(true);
    expect(revealsNewReply(true, null, null)).toBe(true);
  });

  it("brings someone else's into view for whoever is typing in this thread's box", () => {
    expect(revealsNewReply(false, composer, field)).toBe(true);
  });
});
