import { foldQuery, matchName } from "@/lib/store/search";

/** One choice in a Send to ClickUp list: a channel, or a person. */
export interface ClickUpOption {
  id: string;
  label: string;
  /** A second line that's searched too, such as a person's email. */
  detail?: string | null;
}

/**
 * Whether keyboard focus fell to the page: the control that had it left with
 * the window's last view (Send, as the window turned into the way to
 * reconnect; Try again, as the lists reloaded). The view that replaces it
 * then takes focus, so it doesn't stay lost behind the modal.
 */
export function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

/** Most options a list shows at once; typing narrows the rest down. */
export const SHOWN_MAX = 50;

/**
 * The options matching `query` (case- and accent-insensitive, in the label
 * or the detail), in their own order, at most `SHOWN_MAX`; `more` counts
 * what's left out.
 */
export function filterClickUpOptions(
  options: readonly ClickUpOption[],
  query: string,
): { shown: ClickUpOption[]; more: number } {
  const needle = foldQuery(query);
  const matching = needle
    ? options.filter(
        (option) =>
          matchName(option.label, needle) !== null ||
          (option.detail ? matchName(option.detail, needle) !== null : false),
      )
    : options;
  return {
    shown: matching.slice(0, SHOWN_MAX),
    more: Math.max(0, matching.length - SHOWN_MAX),
  };
}
