import {
  RETRY_WONT_HELP,
  type ImportFailure,
  type ImportProgress,
  type ImportReport,
  type SkippedItem,
  type SkipReason,
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
  // Zero counts are left out ("2 folders", not "0 projects and 2 folders").
  const parts = [
    counts.projects > 0 ? count(counts.projects, "project") : "",
    counts.folders > 0 ? count(counts.folders, "folder") : "",
    counts.comments > 0 ? count(counts.comments, "comment") : "",
  ].filter(Boolean);
  return `This browser has ${listed(parts.length > 0 ? parts : [count(0, "project")])}.`;
}

export const FAILURE_COPY: Record<ImportFailure, string> = {
  offline: "We couldn't reach Squint. Check your connection, then try again.",
  "signed-out": "You've been signed out. Sign in again and we'll offer to import again.",
  "storage-full": "Your workspace is out of storage. Free up some space, then try again.",
  server: "Something went wrong on our side. Try again in a moment.",
  "local-files":
    "This browser's saved images couldn't be read. Close other Squint tabs, then try again.",
  "images-blocked":
    "This browser blocks access to its saved images, as private windows do. Open Squint in a normal window to import them, or discard the local data.",
  folders:
    "Some folders saved in this browser are damaged, so Squint couldn't accept them. Trying again won't fix this. Keep this data for now and ask the Squint team for help, or discard it.",
};

/** The reassurance under a failure: what was kept, and how to carry on. */
export function failureNote(failure: ImportFailure, workspace: string): string {
  const kept = `Nothing has been removed from this browser. Anything already imported stays in ${workspace}`;
  if (failure === "signed-out") return `${kept}. Sign in again to pick up where it stopped.`;
  return RETRY_WONT_HELP.has(failure)
    ? `${kept}.`
    : `${kept}, and Retry picks up where it stopped.`;
}

export const DISCARDED_TOAST = "Local data discarded from this browser.";

/** A stage's first line (nothing done yet) names the whole job; later lines count. */
export function progressLine(progress: ImportProgress | null): string {
  if (!progress) return "Getting started…";
  const { stage, done, total } = progress;
  if (stage === "projects") {
    if (done > 0) return `Saved ${done} of ${total}`;
    return total > 0 ? `Saving ${count(total, "project")}…` : "Saving projects…";
  }
  if (done > 0) return `Uploaded ${done} of ${total}`;
  return total > 0 ? `Uploading ${count(total, "image")}…` : "Uploading images…";
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
  refused: () => "has damaged details, so Squint couldn't accept it",
  "too-large": () => "is too large to import",
  "no-folder": () => "wasn't imported because its folder couldn't be imported",
  "in-trash": () => "is in the trash. Restore it, then import again",
  "link-lost": () => "was imported without its review link, which couldn't be moved over",
  "file-missing": (n) =>
    `${count(n, "image")} ${n === 1 ? "is" : "are"} no longer saved in this browser`,
  "file-refused": (n) =>
    `${count(n, "image")} ${n === 1 ? "was" : "were"} too large or not a supported type`,
  "no-surface": (n) =>
    `${count(n, "comment")} ${n === 1 ? "was" : "were"} on a page or snapshot that no longer exists`,
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
    : "This browser still has its copy, so nothing is lost. Discard it when you no longer need it.";
}

export function discardDetail(counts: LocalCounts | null): string {
  const what = counts
    ? `${offerSubject(counts)} and their comments and images`
    : "everything Squint saved in this browser, including what couldn't be read";
  return `This deletes ${what} from this browser. Nothing will be imported, and this can't be undone.`;
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
