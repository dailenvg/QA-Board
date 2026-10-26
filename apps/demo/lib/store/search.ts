import type { Folder, Project, SquintData } from "./types";

/** Where a query matched a name, in the name's own UTF-16 offsets: `[start, end)`. */
export interface MatchRange {
  start: number;
  end: number;
}

export interface FolderHit {
  folder: Folder;
  /** Names of the folders above it, top level first (empty at the top level). */
  path: string[];
  match: MatchRange;
}

export interface ProjectHit {
  project: Project;
  /** Names of its folder and the folders above that, top level first. */
  path: string[];
  match: MatchRange;
}

export interface SearchResults {
  folders: FolderHit[];
  projects: ProjectHit[];
  /** Matches left out by the caps. */
  moreFolders: number;
  moreProjects: number;
}

export const SEARCH_LIMITS = { folders: 5, projects: 8 } as const;

export const NO_RESULTS: SearchResults = {
  folders: [],
  projects: [],
  moreFolders: 0,
  moreProjects: 0,
};

const MARKS = /\p{M}/gu;
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Lower case without accents, so "Café" and "CAFE" compare equal. */
function foldChar(char: string): string {
  return char.normalize("NFD").replace(MARKS, "").toLowerCase();
}

/**
 * Where `needle` (already folded) appears in `name`, case- and accent-insensitively,
 * mapped back to `name`'s own offsets so the highlight covers the accented letters.
 */
export function matchName(name: string, needle: string): MatchRange | null {
  if (!needle) return null;
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const char of name) {
    const piece = foldChar(char);
    // A combining accent folds away; it belongs to the letter before it, so the highlight takes it.
    if (!piece && ends.length) ends[ends.length - 1] = offset + char.length;
    for (let unit = 0; unit < piece.length; unit += 1) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    folded += piece;
    offset += char.length;
  }
  const at = folded.indexOf(needle);
  if (at < 0) return null;
  return { start: starts[at] ?? 0, end: ends[at + needle.length - 1] ?? name.length };
}

/** The query as names are compared: trimmed, lower case, no accents. */
export function foldQuery(query: string): string {
  return Array.from(query.trim(), foldChar).join("");
}

/** Matches, names that start with the query first, then alphabetically. */
function rank<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  needle: string,
): Array<{ item: T; match: MatchRange }> {
  return items
    .flatMap((item) => {
      const match = matchName(nameOf(item), needle);
      return match ? [{ item, match }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.match.start === 0) - Number(a.match.start === 0) ||
        collator.compare(nameOf(a.item), nameOf(b.item)),
    );
}

/** Folder id to the names from the top level down to it, inclusive. */
function folderPaths(folders: readonly Folder[]): (folderId: string) => string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const cache = new Map<string, string[]>();
  const pathOf = (folderId: string): string[] => {
    const cached = cache.get(folderId);
    if (cached) return cached;
    const names: string[] = [];
    let current = byId.get(folderId);
    // Load repair rules out cycles; the bound is a guard all the same.
    while (current && names.length < folders.length) {
      names.unshift(current.name);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    cache.set(folderId, names);
    return names;
  };
  return pathOf;
}

/**
 * Every folder and project whose name contains the query, at any depth, case- and
 * accent-insensitively. Names starting with the query come first, then A to Z. Each group is
 * capped (`limits`); what's left out is counted. An empty query finds nothing.
 */
export function searchWorkspace(
  { folders, projects }: Pick<SquintData, "folders" | "projects">,
  query: string,
  limits: { folders: number; projects: number } = SEARCH_LIMITS,
): SearchResults {
  const needle = foldQuery(query);
  if (!needle) return NO_RESULTS;
  const pathOf = folderPaths(folders);
  const folderMatches = rank(folders, (folder) => folder.name, needle);
  const projectMatches = rank(projects, (project) => project.name, needle);
  return {
    folders: folderMatches.slice(0, limits.folders).map(({ item, match }) => ({
      folder: item,
      path: pathOf(item.id).slice(0, -1),
      match,
    })),
    projects: projectMatches.slice(0, limits.projects).map(({ item, match }) => ({
      project: item,
      path: pathOf(item.folderId),
      match,
    })),
    moreFolders: Math.max(0, folderMatches.length - limits.folders),
    moreProjects: Math.max(0, projectMatches.length - limits.projects),
  };
}
