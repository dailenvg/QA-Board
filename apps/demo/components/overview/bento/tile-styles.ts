/** A tile's surface: a soft panel on the page, as the hero and the folder pages' panels. */
export const TILE_SURFACE = "flex h-full flex-col gap-4 rounded-panel bg-panel p-5 sm:p-6";

/**
 * A row inside a tile that opens something: full width, at least 44px tall, its hover fill
 * reaching the tile's padding (the list pulls itself out by the same amount).
 */
export const TILE_ROW =
  "flex min-h-11 flex-col justify-center gap-1 rounded-row px-3 py-2 transition-colors hover:bg-hover active:bg-seg";

/** The list holding `TILE_ROW`s. */
export const TILE_LIST = "-mx-3 flex flex-col gap-1";
