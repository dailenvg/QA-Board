/** Room, in px, kept between a revealed element and its scroller's edge (its focus ring fits). */
const MARGIN = 8;

/**
 * Scrolls `element`'s nearest scrolling ancestor, never the page, just enough to show it:
 * the sidebar's navigation, or the folder tree's own list on narrow screens.
 */
export function revealInScroller(element: HTMLElement, smooth: boolean): void {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (!scrolls || node.scrollHeight <= node.clientHeight) continue;
    const box = node.getBoundingClientRect();
    const own = element.getBoundingClientRect();
    const behavior = smooth ? "smooth" : "auto";
    if (own.top < box.top + MARGIN) {
      node.scrollBy({ top: own.top - box.top - MARGIN, behavior });
    } else if (own.bottom > box.bottom - MARGIN) {
      node.scrollBy({ top: own.bottom - box.bottom + MARGIN, behavior });
    }
    return;
  }
}
