import { folderHref, projectHref } from "@/lib/routes";
import type { MatchRange, SearchResults } from "@/lib/store/search";
import { projectKind } from "../dashboard/project-source";
import type { IconName } from "../ui/Icon";

/** One search result as the listbox shows it. */
export interface SearchEntry {
  key: string;
  href: string;
  name: string;
  match: MatchRange;
  icon: IconName;
  /** Visible second line: where it sits. */
  where: string;
  /** Read after the visible text, so the option's name holds what it shows (WCAG 2.5.3). */
  type: string;
}

export interface SearchEntryGroups {
  folders: SearchEntry[];
  projects: SearchEntry[];
}

const TOP_LEVEL = "Top level";

export function searchEntries(results: SearchResults): SearchEntryGroups {
  return {
    folders: results.folders.map(({ folder, path, match }) => ({
      key: `folder-${folder.id}`,
      href: folderHref(folder.id),
      name: folder.name,
      match,
      icon: "folder",
      where: path.length ? path.join(" › ") : TOP_LEVEL,
      type: "Folder",
    })),
    projects: results.projects.map(({ project, path, match }) => {
      const kind = projectKind(project.source);
      return {
        key: `project-${project.id}`,
        href: projectHref(project.id),
        name: project.name,
        match,
        icon: kind.icon,
        where: path.join(" › "),
        type: kind.label,
      };
    }),
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "+3 more projects and +1 more folder", or null when nothing was left out. */
export function moreNote({ moreFolders, moreProjects }: SearchResults): string | null {
  const parts = [
    ...(moreProjects ? [`+${plural(moreProjects, "more project")}`] : []),
    ...(moreFolders ? [`+${plural(moreFolders, "more folder")}`] : []),
  ];
  return parts.length ? parts.join(" and ") : null;
}

/** What the live region says once a query has run. */
export function resultsAnnouncement(results: SearchResults): string {
  const total =
    results.folders.length + results.projects.length + results.moreFolders + results.moreProjects;
  return total ? `${plural(total, "result")} found` : "No results";
}
