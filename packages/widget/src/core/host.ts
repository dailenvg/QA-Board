export const HOST_TAG = "pinpoint-root";
export const HOST_ATTRIBUTE = "data-pinpoint-host";

/**
 * Inline styles for the shadow host. Fixed and full-viewport so the overlay
 * never shifts layout, with pointer events off so the page stays usable.
 * Interactive children opt back in.
 */
export const HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "inset: 0",
  "pointer-events: none",
  "z-index: 2147483646",
  "contain: layout style",
].join(";");
