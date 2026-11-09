import type { IconName } from "./Icon";

interface MenuItemBase {
  label: string;
  /** Leading icon. Radio items (`checked` set) show their check there instead. */
  icon?: IconName;
  danger?: boolean;
  /** Stays focusable (aria-disabled), so a label that explains why is still read out. */
  disabled?: boolean;
  /** A line above this item, to set it apart from the ones before. */
  separatorBefore?: boolean;
  /** Identifies the item when its label changes (a pending label); the label by default. */
  id?: string;
  testId?: string;
}

/** An action, a radio option or a checkbox. */
export interface MenuActionItem extends MenuItemBase {
  onSelect: () => void;
  /**
   * Radio items (the default kind): true for the current option of the set.
   * Checkbox items: whether the setting is on.
   */
  checked?: boolean;
  /** A setting that toggles in place (menuitemcheckbox) and leaves the menu open. */
  kind?: "checkbox";
  /** Leaves the menu open on select, for an action whose label shows its progress. */
  keepOpen?: boolean;
  /**
   * Working (its label says so): unavailable like `disabled`, but not dimmed, so the progress
   * label stays readable.
   */
  busy?: boolean;
  href?: never;
  current?: never;
}

/** A link to another page. */
export interface MenuLinkItem extends MenuItemBase {
  href: string;
  /** That page is open: marked current, and still a link. */
  current?: boolean;
  onSelect?: never;
  checked?: never;
  kind?: never;
  keepOpen?: never;
  busy?: never;
}

export type MenuItem = MenuActionItem | MenuLinkItem;

export type MenuItemRole = "menuitem" | "menuitemradio" | "menuitemcheckbox";

/** Every item role; separators and other children aren't items, so arrow keys skip them. */
export const ITEM_SELECTOR = '[role^="menuitem"]';

export function itemRole(item: MenuItem): MenuItemRole {
  if (item.kind === "checkbox") return "menuitemcheckbox";
  return item.checked === undefined ? "menuitem" : "menuitemradio";
}

/** Choosing an item closes the menu, except a checkbox (toggled in place) or a `keepOpen` action. */
export function closesOnSelect(item: MenuItem): boolean {
  return item.kind !== "checkbox" && !item.keepOpen;
}
