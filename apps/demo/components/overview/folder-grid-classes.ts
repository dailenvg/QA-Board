/**
 * The Overview's folder grid, shared with its skeleton: one column on phones,
 * two from 640px, then three to five once the sidebar sits beside it, each
 * folder at most FOLDER_MAX_WIDTH and centered in its column.
 *
 * A fan reaches about a ninth of a folder's width past each side and, with a
 * full stack, about 48px above its box. Each folder's own headroom (the empty
 * top of its box) takes most of that, so the grid adds only a little top
 * padding: at the very most a hovered back sheet reaches into the hero's
 * bottom padding, raised above it, never its content. Below lg, where folders
 * are drawn smaller and fan with a wider step, a keyboard-focused back sheet
 * rises further, so the grid adds a little more.
 *
 * Where nothing hovers (touch), files never fan from a pointer, so rows close
 * up: half the row gap, no top padding, and each card pulls its headroom back
 * (FolderCard).
 */
export const FOLDER_GRID =
  "grid grid-cols-1 justify-items-center gap-x-6 gap-y-12 px-4 pt-2 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 max-lg:[@media(hover:hover)]:pt-6 [@media(hover:none)]:gap-y-6 [@media(hover:none)]:pt-0";

/**
 * FOLDER_GRID's column steps as media queries (Tailwind's sm, lg, xl and 2xl),
 * so the grid can tell which row and column each folder lands in. Keep the two
 * in step.
 */
export const FOLDER_GRID_COLUMNS = [
  { query: "(min-width: 96rem)", columns: 5 },
  { query: "(min-width: 80rem)", columns: 4 },
  { query: "(min-width: 64rem)", columns: 3 },
  { query: "(min-width: 40rem)", columns: 2 },
] as const;
