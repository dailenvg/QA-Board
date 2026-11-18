/**
 * The Workspaces lists' columns from md up: the workspace (name, owner,
 * status), members, projects, storage, last activity (or when it was
 * archived), then its actions. Rows, the header row and the loading
 * skeleton share it. Below md each workspace is a card instead.
 *
 * The workspace column never narrows past 12rem, the widest status badge
 * ("Scheduled for deletion") and a little room; the date column never past
 * 6rem, a date on one line. Between md and about 1100px (the sidebar's in
 * from lg) the fr shares alone would cut both short.
 */
export const WORKSPACE_GRID =
  "md:grid md:grid-cols-[minmax(12rem,2.2fr)_4rem_4rem_minmax(0,1.6fr)_minmax(6rem,1.2fr)_auto] md:items-center md:gap-4";
