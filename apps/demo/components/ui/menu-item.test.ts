import { describe, expect, it } from "vitest";
import { closesOnSelect, itemRole, ITEM_SELECTOR, type MenuItem } from "./menu-item";

const noop = () => {};

describe("itemRole", () => {
  it("keeps plain and radio items as they were", () => {
    expect(itemRole({ label: "Rename", onSelect: noop })).toBe("menuitem");
    expect(itemRole({ label: "Name", onSelect: noop, checked: false })).toBe("menuitemradio");
    expect(itemRole({ label: "Date", onSelect: noop, checked: true })).toBe("menuitemradio");
  });

  it("makes a checkbox item a menuitemcheckbox, on or off", () => {
    expect(itemRole({ label: "Dark mode", kind: "checkbox", onSelect: noop })).toBe(
      "menuitemcheckbox",
    );
    expect(itemRole({ label: "Dark mode", kind: "checkbox", checked: true, onSelect: noop })).toBe(
      "menuitemcheckbox",
    );
  });

  it("makes a link a plain menuitem, current or not", () => {
    expect(itemRole({ label: "Account", href: "/account" })).toBe("menuitem");
    expect(itemRole({ label: "Account", href: "/account", current: true })).toBe("menuitem");
  });
});

describe("closesOnSelect", () => {
  it("closes for actions, options and links", () => {
    const items: MenuItem[] = [
      { label: "Rename", onSelect: noop },
      { label: "Name", onSelect: noop, checked: true },
      { label: "Account", href: "/account" },
    ];
    expect(items.map(closesOnSelect)).toEqual([true, true, true]);
  });

  it("stays open for a checkbox, toggled in place, and a keepOpen action", () => {
    expect(closesOnSelect({ label: "Dark mode", kind: "checkbox", onSelect: noop })).toBe(false);
    expect(closesOnSelect({ label: "Sign out", keepOpen: true, onSelect: noop })).toBe(false);
  });
});

describe("ITEM_SELECTOR", () => {
  it("matches every item role and not a separator, so arrow keys skip separators", () => {
    // `[role^="menuitem"]`: a prefix match on the role attribute.
    const prefix = /^\[role\^="(.+)"\]$/.exec(ITEM_SELECTOR)?.[1] ?? "";
    for (const role of ["menuitem", "menuitemradio", "menuitemcheckbox"]) {
      expect(role.startsWith(prefix)).toBe(true);
    }
    expect("separator".startsWith(prefix)).toBe(false);
  });
});
