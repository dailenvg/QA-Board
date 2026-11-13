import { describe, expect, it } from "vitest";
import {
  addChips,
  chipLabel,
  chipsMessage,
  markChips,
  removeChip,
  sendableChips,
  type InviteChip,
} from "./invite-chips";

const chip = (address: string, problem: InviteChip["problem"] = null): InviteChip => ({
  address,
  problem,
});

describe("invite chips", () => {
  it("turn typed or pasted text into lowercased chips, skipping repeats", () => {
    const first = addChips([], "Ana@Acme.studio, leo@acme.studio\nana@acme.studio");
    expect(first).toEqual({
      chips: [chip("ana@acme.studio"), chip("leo@acme.studio")],
      added: ["ana@acme.studio", "leo@acme.studio"],
      overflow: 0,
    });
    expect(addChips(first.chips, "LEO@acme.studio").added).toEqual([]);
  });

  it("mark what isn't an address as it's added", () => {
    expect(addChips([], "ana@acme.studio nope").chips).toEqual([
      chip("ana@acme.studio"),
      chip("nope", "invalid"),
    ]);
  });

  it("stop at 10 and count the rest", () => {
    const pasted = Array.from({ length: 12 }, (_, index) => `p${index}@acme.studio`).join(" ");
    const { chips, overflow } = addChips([], pasted);
    expect(chips).toHaveLength(10);
    expect(overflow).toBe(2);
    expect(chipsMessage(chips, overflow)).toBe(
      "Up to 10 at a time. Send these first, then add the rest.",
    );
  });

  it("come off one at a time", () => {
    expect(removeChip([chip("a@b.co"), chip("c@d.co")], "a@b.co")).toEqual([chip("c@d.co")]);
  });

  it("take the server's refusals, by address", () => {
    expect(
      markChips([chip("ana@acme.studio"), chip("leo@acme.studio")], ["ANA@acme.studio"], "outside"),
    ).toEqual([chip("ana@acme.studio", "outside"), chip("leo@acme.studio")]);
  });

  it("send only with at least one chip and nothing wrong", () => {
    expect(sendableChips([])).toBe(false);
    expect(sendableChips([chip("a@b.co")])).toBe(true);
    expect(sendableChips([chip("a@b.co"), chip("x", "invalid")])).toBe(false);
  });

  it("say what's wrong, under the field and to screen readers", () => {
    expect(chipsMessage([chip("a@b.co")], 0)).toBeNull();
    expect(chipsMessage([chip("nope", "invalid")], 0)).toBe(
      `"nope" isn't an email address. Remove it and type it again.`,
    );
    expect(chipsMessage([chip("x", "invalid"), chip("y", "invalid")], 0)).toBe(
      "2 entries aren't email addresses. Remove the marked ones and type them again.",
    );
    expect(chipsMessage([chip("ana@acme.studio", "outside")], 0)).toBe(
      "This preview site only emails people in your workspace. Remove the marked address.",
    );
    expect(chipLabel(chip("nope", "invalid"))).toBe("nope, not an email address");
    expect(chipLabel(chip("ana@acme.studio", "outside"))).toBe(
      "ana@acme.studio, not in your workspace",
    );
  });
});
