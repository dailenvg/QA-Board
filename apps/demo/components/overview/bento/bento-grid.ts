/**
 * The bento's grid, shared with its skeleton so nothing moves when the page arrives: one
 * column on phones, two from md, three from xl. Where a wide window is also tall enough
 * (`bento-fit`), it takes the page's leftover height and no more: size containment keeps its
 * content from stretching the page, and the hero's row sizes to the hero while the two rows
 * under it share the rest.
 */
export const BENTO_GRID =
  "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 bento-fit:min-h-0 bento-fit:flex-1 bento-fit:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] bento-fit:[contain:size]";
