import type { Point } from "./geometry";

export type WalkKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const NON_VISUAL_TAGS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "template",
  "noscript",
  "head",
]);

export function isWalkKey(key: string): key is WalkKey {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/** True when the event originated inside the widget's shadow host. */
export function isFromHost(event: Event, host: Element): boolean {
  return event.composedPath().includes(host);
}

/** Page element under a viewport point, ignoring the widget host. */
export function elementAtPoint(
  point: Point,
  host: Element,
  doc: Document = document,
): Element | null {
  const element = doc.elementFromPoint(point.x, point.y);
  return element && element !== host ? element : null;
}

/** The focused element, looking through open shadow roots. */
export function deepActiveElement(doc: Document = document): HTMLElement | null {
  let active = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active instanceof HTMLElement ? active : null;
}

export function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function isTargetable(element: Element, host: Element): boolean {
  if (element === host || NON_VISUAL_TAGS.has(element.localName)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function firstTargetable(
  start: Element | null,
  step: (element: Element) => Element | null,
  host: Element,
): Element | null {
  for (let node = start; node; node = step(node)) {
    if (isTargetable(node, host)) return node;
  }
  return null;
}

/** Where keyboard targeting starts when nothing is targeted yet. */
export function initialKeyboardTarget(host: Element, doc: Document = document): Element {
  const main = doc.querySelector("main, [role='main']");
  if (main) return main;
  return (
    firstTargetable(doc.body.firstElementChild, (node) => node.nextElementSibling, host) ?? doc.body
  );
}

/**
 * Moves a keyboard target through the DOM: up to the parent, down to the first
 * child, left/right across siblings. Returns `from` when there is nowhere to go.
 */
export function walkElement(from: Element, key: WalkKey, host: Element): Element {
  const next = {
    ArrowUp: () =>
      from.parentElement && from.parentElement.localName !== "html" ? from.parentElement : null,
    ArrowDown: () =>
      firstTargetable(from.firstElementChild, (node) => node.nextElementSibling, host),
    ArrowLeft: () =>
      firstTargetable(from.previousElementSibling, (node) => node.previousElementSibling, host),
    ArrowRight: () =>
      firstTargetable(from.nextElementSibling, (node) => node.nextElementSibling, host),
  }[key]();
  return next ?? from;
}

/** Short human description, e.g. `button "Sign up"`, for screen reader announcements. */
export function describeElement(element: Element): string {
  const label =
    element.getAttribute("aria-label") ??
    element.getAttribute("alt") ??
    element.textContent?.replace(/\s+/g, " ").trim() ??
    "";
  const text = label.length > 40 ? `${label.slice(0, 40)}…` : label;
  return text ? `${element.localName} "${text}"` : element.localName;
}
