import { useEffect, useRef, useState } from "react";
import { rowsThatFit } from "@/lib/overview/charts";
import { useMediaQuery } from "@/lib/use-media-query";

/** The `bento-fit` variant's query (globals.css): the bento fits one screen. */
export const BENTO_FIT_QUERY = "(min-width: 80rem) and (min-height: 49rem)";

/** The "+N more" link's height in px (`MoreLink`, a 44px target). */
const MORE_HEIGHT = 44;

interface Fitted {
  rows: number;
  /** "+N more" fits under them. */
  more: boolean;
}

/**
 * Whole rows only, and "+N more" whole or not at all: never a row or link cut off at the box's
 * edge. When even one row and the link don't fit together, the row stays and the link goes
 * (what it leads to, Folders, is always in the sidebar).
 */
function fitInBox(available: number, row: number, gap: number, total: number, overall: number) {
  let rows = rowsThatFit({ available, row, gap, more: MORE_HEIGHT, total });
  const withMore = (count: number) => count * row + count * gap + MORE_HEIGHT;
  // Rows past the list (`overall`) need the link even when the whole list fits.
  while (rows > 1 && overall > rows && withMore(rows) > available) rows -= 1;
  return { rows, more: overall > rows && withMore(rows) <= available };
}

/**
 * How many of a tile's `total` rows to show, and whether its "+N more" link
 * shows (`overall`: how many there are in all, the list's `total` and beyond).
 * Where the bento fits one screen each tile has a set height, so its list
 * (`ref`, on the `<ol>`, inside a box that takes the tile's leftover height)
 * shows as many whole rows as fit, measured from its first row; elsewhere
 * tiles grow, so up to `natural`. The server and the first render show
 * `natural`, so nothing moves outside the tile.
 */
export function useFitRows(total: number, natural: number, overall: number = total) {
  const fit = useMediaQuery(BENTO_FIT_QUERY);
  const ref = useRef<HTMLOListElement>(null);
  const [fitted, setFitted] = useState<Fitted | null>(null);

  useEffect(() => {
    const list = ref.current;
    const box = list?.parentElement;
    if (!fit || !list || !box) return;
    const observer = new ResizeObserver(() => {
      const first = list.firstElementChild;
      if (!(first instanceof HTMLElement)) return;
      const boxStyle = getComputedStyle(box);
      // The box's padding is room for a lifted row's ring, not for rows.
      const padding =
        (Number.parseFloat(boxStyle.paddingTop) || 0) +
        (Number.parseFloat(boxStyle.paddingBottom) || 0);
      setFitted(
        fitInBox(
          box.clientHeight - padding,
          first.offsetHeight,
          Number.parseFloat(getComputedStyle(list).rowGap) || 0,
          total,
          overall,
        ),
      );
    });
    observer.observe(box);
    // And the rows: their height settles once fonts and thumbnails are in.
    observer.observe(list);
    return () => observer.disconnect();
  }, [fit, total, overall]);

  const measured = fit && fitted !== null;
  const shown = Math.min(total, measured ? fitted.rows : natural);
  return { ref, shown, more: measured ? fitted.more : overall > shown };
}
