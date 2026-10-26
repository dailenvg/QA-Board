import type { ProjectSummary } from "@/lib/store/selectors";
import type { ProjectStatus } from "@/lib/store/status";
import { projectKind, type ProjectKind } from "./project-source";

export type SortKey = "date" | "name" | "status" | "fileType";
export type SortDirection = "asc" | "desc";

export interface ProjectSort {
  key: SortKey;
  direction: SortDirection;
}

interface SortSpec {
  label: string;
  /** Where a key starts when picked: the order people expect from it. */
  natural: SortDirection;
  /** The resulting order in words, per direction, for the reverse button's label. */
  order: Record<SortDirection, string>;
}

/** Menu order. */
export const SORT_KEYS: readonly SortKey[] = ["date", "name", "status", "fileType"];

export const SORT_SPECS: Record<SortKey, SortSpec> = {
  date: { label: "Date", natural: "desc", order: { desc: "Newest first", asc: "Oldest first" } },
  name: { label: "Name", natural: "asc", order: { asc: "A to Z", desc: "Z to A" } },
  status: {
    label: "Status",
    natural: "asc",
    order: { asc: "Open comments first", desc: "Resolved first" },
  },
  fileType: {
    label: "File type",
    natural: "asc",
    order: { asc: "Websites first", desc: "PDFs first" },
  },
};

/** Matches today's folder page: most recently updated first. */
export const DEFAULT_SORT: ProjectSort = { key: "date", direction: SORT_SPECS.date.natural };

/** What needs a look comes first: open comments, then untouched, then done. */
const STATUS_RANK: Record<ProjectStatus, number> = { comments: 0, ready: 1, resolved: 2 };

const KIND_RANK: Record<ProjectKind["label"], number> = { Website: 0, Image: 1, PDF: 2 };

/** "Banner 2" before "Banner 10", "apple" beside "Apple", accents read as their letter. */
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

type Compare = (a: ProjectSummary, b: ProjectSummary) => number;

const byName: Compare = (a, b) => collator.compare(a.project.name, b.project.name);
const byDate: Compare = (a, b) => a.project.updatedAt - b.project.updatedAt;
const newestFirst: Compare = (a, b) => byDate(b, a);
const byStatus: Compare = (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status];
const byKind: Compare = (a, b) =>
  KIND_RANK[projectKind(a.project.source).label] - KIND_RANK[projectKind(b.project.source).label];

/** Each key's primary order (ascending) and the tie-break that applies in both directions. */
const COMPARE: Record<SortKey, { primary: Compare; tie: Compare }> = {
  date: { primary: byDate, tie: byName },
  name: { primary: byName, tie: newestFirst },
  status: { primary: byStatus, tie: newestFirst },
  fileType: { primary: byKind, tie: byName },
};

/**
 * A sorted copy. Reversing flips only the primary order: ties keep their
 * tie-break (then their input order), so a reversed list stays readable.
 */
export function sortProjects(
  summaries: readonly ProjectSummary[],
  key: SortKey,
  direction: SortDirection,
): ProjectSummary[] {
  const { primary, tie } = COMPARE[key];
  const sign = direction === "asc" ? 1 : -1;
  return [...summaries].sort((a, b) => sign * primary(a, b) || tie(a, b));
}

function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === "asc" || value === "desc";
}

/** A stored choice; anything unreadable or out of date falls back to the default. */
export function parseSort(raw: string | null): ProjectSort {
  if (!raw) return DEFAULT_SORT;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_SORT;
    const { key, direction } = value as Record<string, unknown>;
    return isSortKey(key) && isSortDirection(direction) ? { key, direction } : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}
