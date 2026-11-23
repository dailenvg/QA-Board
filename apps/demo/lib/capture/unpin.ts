/**
 * Stops the page's pinned bars (fixed and sticky headers, cookie banners, chat
 * buttons, sticky sidebars) from repeating down a stitched image. Run before
 * each slice after the first, once the page has scrolled to it: a header a
 * scroll handler pins only past some point shows up then, and running again
 * only repeats what's done. Returns how many elements it hid and how many it
 * un-stuck.
 *
 * Conservative on purpose, since hiding the wrong element blanks the page:
 * - Sticky elements are never hidden. They're in the normal flow like
 *   `position: relative`, so turning them into exactly that (with no offsets)
 *   changes no layout: each one goes back to its natural place and scrolls
 *   with the page. A sticky sidebar shows in full, a sticky header only at the top.
 * - Fixed elements can't be put back in the flow, so they're hidden, with
 *   `visibility` so nothing moves, but only when shorter than half the
 *   viewport (a header, a banner, a button) and below <body>. A taller one (an
 *   app shell, a full-height sidebar, a background) stays: it's how the page
 *   looks all the way down, and hiding it could hide everything.
 *
 * A string, so bundlers can't rewrite it into something the page can't run.
 */
export const UNPIN_SCRIPT = `(() => {
  const viewport = window.innerHeight;
  let hidden = 0;
  let unstuck = 0;
  for (const element of document.body ? document.body.querySelectorAll("*") : []) {
    const { position } = getComputedStyle(element);
    if (position === "sticky") {
      element.style.setProperty("position", "relative", "important");
      element.style.setProperty("inset", "auto", "important");
      unstuck += 1;
    } else if (position === "fixed" && element.getBoundingClientRect().height < viewport / 2) {
      element.style.setProperty("visibility", "hidden", "important");
      hidden += 1;
    }
  }
  return \`\${hidden} hidden, \${unstuck} unstuck\`;
})()`;
