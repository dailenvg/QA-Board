/**
 * A tile's surface: a soft panel on the page, as the hero and the folder pages' panels. Where
 * the bento fits one screen, the grid sets its height and anything past it is clipped.
 */
export const TILE_SURFACE =
  "flex h-full flex-col gap-4 rounded-panel bg-panel p-5 sm:p-6 bento-fit:min-h-0 bento-fit:gap-3 bento-fit:overflow-hidden bento-fit:p-4";

/**
 * The box a tile's list and its "+N more" link sit in: the tile's leftover height where the
 * bento fits one screen (`useFitRows` measures it), its content's elsewhere. Pulled out into
 * the tile's padding (-mx-3) so a row's hover fill reaches it and "+N more" lines its label up
 * with the tile's text. The box itself is pulled out, not the list inside it: where the box
 * clips, a list wider than the box would lose its rows' sides, focus ring included. Where it
 * clips it also keeps 4px above and below (-my-1 py-1), so a row lifted on hover or focus
 * keeps its ring's top edge.
 */
export const TILE_LIST_BOX =
  "-mx-3 flex flex-col bento-fit:-my-1 bento-fit:min-h-0 bento-fit:flex-1 bento-fit:overflow-hidden bento-fit:py-1";

/** The list of `TileRow`s. */
export const TILE_LIST = "flex flex-col gap-1";
