import type {
  ImportFailure,
  ImportProgress,
  ImportReport,
  SkippedItem,
  SkipReason,
} from "@/lib/workspace-client/import-local";
import type { LocalCounts, LocalImportState } from "@/lib/workspace-client/use-local-import";

/** Every line the import dialog shows, in one place for review. */

const NOUNS = {
  project: ["project", "projects"],
  folder: ["folder", "folders"],
  comment: ["comment", "comments"],
  image: ["image", "images"],
} as const;

/** "1 project", "3 projects". */
export function count(n: number, noun: keyof typeof NOUNS): string {
  const [one, many] = NOUNS[noun];
  return `${n} ${n === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c". */
function listed(parts: string[]): string {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** What the offer's title counts: projects, or folders when there are only folders. */
function offerSubject(counts: LocalCounts): string {
  return counts.projects > 0 ? count(counts.projects, "project") : count(counts.folders, "folder");
}

export function offerDetail(counts: LocalCounts): string {
  const parts = [count(counts.projects, "project"), count(counts.folders, "folder")];
  if (counts.comments > 0) parts.push(count(counts.comments, "comment"));
  return `This browser has ${listed(parts)}.`;
}

export const FAILURE_COPY: Record<ImportFailure, string> = {
  offline: "We couldn't reach Squint. Check your connection, then retry.",
  "signed-out": "You've been signed out. Sign in again and we'll offer the import again.",
  "storage-full": "Your workspace is out of storage. Free up some space, then retry.",
  server: "Something went wrong on our side. Retry in a moment.",
  "local-files":
    "This browser's saved images couldn't be read. Close other Squint tabs, then retry.",
  folders: "Some folders saved in this browser are damaged, so the server couldn't accept them.",
};

export function progressLine(progress: ImportProgress | null): string {
  if (!progress) return "Getting started…";
  const { stage, done, total } = progress;
  return stage === "projects"
    ? `Saving projects: ${done} of ${total}`
    : `Uploading images: ${done} of ${total}`;
}

export function progressFraction(progress: ImportProgress | null): number {
  if (!progress) return 0;
  // Projects fill the first half of the bar, images the second; a stage with nothing in it is full.
  const part = progress.total === 0 ? 0.5 : progress.done / progress.total / 2;
  return progress.stage === "projects" ? part : 0.5 + part;
}

export function summaryLine(report: ImportReport, workspace: string): string {
  const parts = [
    count(report.projects, "project"),
    count(report.comments, "comment"),
    count(report.files, "image"),
  ];
  return `${listed(parts)} are now in ${workspace}.`;
}

const REASONS: Record<SkipReason, (n: number) => string> = {
  "other-workspace": () => "already belongs to another workspace, so it wasn't imported",
  refused: () => "has damaged details, so the server couldn't accept it",
  "too-large": () => "is too large to import",
  "no-folder": () => "wasn't imported because its folder couldn't be",
  "link-lost": () => "came in without its review link, which had expired",
  "file-missing": (n) => `${count(n, "image")} no longer saved in this browser`,
  "file-refused": (n) => `${count(n, "image")} too large or not a supported type`,
  "no-surface": (n) => `${count(n, "comment")} on a page or snapshot that no longer exists`,
};

/** One line per project and reason, with repeated files and comments counted together. */
export function skippedLines(skipped: readonly SkippedItem[]): string[] {
  const grouped = new Map<string, { item: SkippedItem; n: number }>();
  for (const item of skipped) {
    const id = `${item.projectName}\u0000${item.reason}`;
    const entry = grouped.get(id) ?? { item, n: 0 };
    entry.n += item.count ?? 1;
    grouped.set(id, entry);
  }
  return [...grouped.values()].map(({ item, n }) => {
    const reason = REASONS[item.reason](n);
    return item.kind === "project"
      ? `${item.projectName} ${reason}.`
      : `${item.projectName}: ${reason}.`;
  });
}

export function keptLine(report: ImportReport): string {
  return report.cleared
    ? "This browser's copy has been removed."
    : "This browser keeps its copy, so nothing is lost. Discard it once you've moved what you need.";
}

export function discardDetail(counts: LocalCounts | null): string {
  const what = counts
    ? `${count(counts.projects, "project")} and their comments and images`
    : "everything Squint saved in this browser, including what couldn't be read";
  return `This deletes ${what} from this browser. They won't be imported, and this can't be undone.`;
}

/** The dialog's title and description for each view. */
export function dialogText(
  state: Exclude<LocalImportState, { view: "hidden" }>,
  workspace: string,
): { title: string; description: string } {
  switch (state.view) {
    case "offer":
      return {
        title: `Import ${offerSubject(state.counts)} into ${workspace}?`,
        description: `They're saved only in this browser. Importing adds them to ${workspace} with their comments and images, then removes this browser's copy.`,
      };
    case "unreadable":
      return {
        title: "We couldn't read the projects saved in this browser",
        description: `${state.reason} Nothing has been removed.`,
      };
    case "importing":
      return {
        title: `Importing into ${workspace}…`,
        description: "Keep this page open until it's done.",
      };
    case "failed":
      return { title: "The import didn't finish", description: FAILURE_COPY[state.failure] };
    case "done":
      return {
        title: state.report.cleared ? `Imported into ${workspace}` : "Some items weren't imported",
        description: summaryLine(state.report, workspace),
      };
    case "confirm-discard":
    case "discarding":
      return {
        title: "Discard local data?",
        description: discardDetail(state.counts),
      };
  }
}
