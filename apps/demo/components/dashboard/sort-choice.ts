/** What a list is sorted by and which way: shared by folder pages and the Overview. */

export type SortDirection = "asc" | "desc";

export interface SortChoice<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export interface SortSpec {
  label: string;
  /** Where a key starts when picked: the order people expect from it. */
  natural: SortDirection;
  /** The resulting order in words, per direction, for the reverse button's label. */
  order: Record<SortDirection, string>;
}

/** A list's sort options: its keys in menu order, each key's spec, and the default. */
export interface SortOptions<Key extends string> {
  keys: readonly Key[];
  specs: Record<Key, SortSpec>;
  fallback: SortChoice<Key>;
}

/** "Banner 2" before "Banner 10", "apple" beside "Apple", accents read as their letter. */
export const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

/** A stored choice; anything unreadable or out of date falls back to the default. */
export function parseSortChoice<Key extends string>(
  raw: string | null,
  { keys, fallback }: SortOptions<Key>,
): SortChoice<Key> {
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return fallback;
    const { key, direction } = value as Record<string, unknown>;
    const known = (keys as readonly unknown[]).includes(key);
    return known && isSortDirection(direction) ? { key: key as Key, direction } : fallback;
  } catch {
    return fallback;
  }
}
