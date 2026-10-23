/**
 * Robust CSS selector generation for pin anchoring.
 *
 * Priority: stable id > data-testid > other stable attributes
 * (data-pin-anchor, name, aria-label) > nth-of-type path. Every candidate is
 * verified with querySelectorAll so the selector matches exactly one element.
 */

const TEST_ID_ATTRIBUTE = "data-testid";
const STABLE_ATTRIBUTES = ["data-pin-anchor", "name", "aria-label"] as const;
const SELF_UNIQUE_TAGS = new Set(["html", "body"]);

function fallbackEscape(value: string): string {
  return Array.from(value)
    .map((char, index) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0) return "\uFFFD";
      if ((code >= 0x1 && code <= 0x1f) || code === 0x7f) return `\\${code.toString(16)} `;
      if (index === 0 && /\d/.test(char)) return `\\${code.toString(16)} `;
      if (index === 0 && char === "-" && value.length === 1) return "\\-";
      if (/[\w-]/.test(char) || code >= 0x80) return char;
      return `\\${char}`;
    })
    .join("");
}

export function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : fallbackEscape(value);
}

function escapeAttributeValue(value: string): string {
  return value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");
}

function countDigits(value: string): number {
  return value.replace(/\D/g, "").length;
}

/** Segments like `1a2b`, `x7f9k2`: letters and digits interleaved, typical of hashes. */
function isHashLikeSegment(segment: string): boolean {
  if (segment.length < 4 || !/\d/.test(segment) || !/[a-z]/i.test(segment)) return false;
  const transitions = segment.match(/(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)/gi)?.length ?? 0;
  return transitions >= 2;
}

/**
 * True when an id looks hand-written. Rejects React `useId` output (`:r1:`,
 * `«r1»`), ids starting with a digit, long numeric runs, digit-heavy ids, and
 * hash-like segments.
 */
export function isStableId(id: string): boolean {
  if (id === "" || id.trim() !== id || /\s/.test(id)) return false;
  if (/[:«»]/.test(id)) return false;
  if (/^\d/.test(id)) return false;
  if (/\d{4,}/.test(id)) return false;
  const digits = countDigits(id);
  if (digits >= 3 && digits / id.length > 0.3) return false;
  return !id.split(/[-_.]/).some(isHashLikeSegment);
}

function matchesOnly(selector: string, element: Element): boolean {
  try {
    const matches = element.ownerDocument.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

function attributeSelector(element: Element, attribute: string, withTag: boolean): string | null {
  const value = element.getAttribute(attribute);
  if (!value) return null;
  const tag = withTag ? cssEscape(element.localName) : "";
  return `${tag}[${attribute}="${escapeAttributeValue(value)}"]`;
}

/** A stable selector that identifies `element` on its own, or null if none is unique. */
function stableAnchor(element: Element): string | null {
  const id = element.getAttribute("id");
  const candidates = [
    id && isStableId(id) ? `#${cssEscape(id)}` : null,
    attributeSelector(element, TEST_ID_ATTRIBUTE, false),
    ...STABLE_ATTRIBUTES.map((attribute) => attributeSelector(element, attribute, true)),
  ];

  for (const candidate of candidates) {
    if (candidate && matchesOnly(candidate, element)) return candidate;
  }
  return null;
}

function nthOfTypeSegment(element: Element): string {
  const tag = cssEscape(element.localName);
  const parent = element.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter(
    (sibling) => sibling.localName === element.localName,
  );
  if (sameTag.length === 1) return tag;
  return `${tag}:nth-of-type(${sameTag.indexOf(element) + 1})`;
}

function fullPath(element: Element): string {
  const segments: string[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    segments.unshift(
      SELF_UNIQUE_TAGS.has(node.localName) ? node.localName : nthOfTypeSegment(node),
    );
    if (node.localName === "html") break;
  }
  return segments.join(" > ");
}

/**
 * Generates a selector that matches only `element`.
 *
 * Walks up from the element and, when it reaches an ancestor with a stable
 * identifier, returns the path anchored there (survives unrelated DOM changes
 * elsewhere on the page). Without such an ancestor it returns the shortest
 * unique nth-of-type suffix, and as a last resort the full path from <html>.
 */
export function generateSelector(element: Element): string {
  if (SELF_UNIQUE_TAGS.has(element.localName)) return element.localName;

  const segments: string[] = [];
  let shortestUnique: string | null = null;

  for (let node: Element | null = element; node; node = node.parentElement) {
    if (SELF_UNIQUE_TAGS.has(node.localName)) break;

    const anchor = stableAnchor(node);
    if (anchor) {
      const anchored = [anchor, ...segments].join(" > ");
      if (matchesOnly(anchored, element)) return anchored;
    }

    segments.unshift(nthOfTypeSegment(node));
    if (shortestUnique === null) {
      const candidate = segments.join(" > ");
      if (matchesOnly(candidate, element)) shortestUnique = candidate;
    }
  }

  return shortestUnique ?? fullPath(element);
}

/** Resolves a stored selector. Returns null when it is invalid or matches nothing. */
export function resolveSelector(selector: string, root: Document = document): Element | null {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}
