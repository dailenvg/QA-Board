import type { SquiggyEvent } from "./events";
import type { BusiestFolder, WorkspaceSummary } from "./mood-engine";

/** Squiggy's line about the workspace: comments waiting (a link to their folder), or all resolved. */
export type AmbientSpeech =
  { kind: "waiting"; folder: BusiestFolder; total: number } | { kind: "resolved" };

/** A one-off line for the event Squiggy is reacting to. Never a link. */
export type ReactionSpeech =
  | { kind: "just-resolved" }
  | { kind: "just-created"; projectName: string }
  | { kind: "just-deleted"; undoable: boolean }
  | { kind: "save-failed" };

export type SquiggySpeech = AmbientSpeech | ReactionSpeech;

/**
 * What Squiggy has to say about the workspace, from the same summary as the
 * ambient mood. Null when there's nothing specific: no projects (the welcome
 * and the empty state already ask for one), or only projects without comments.
 */
export function squiggySpeech(summary: WorkspaceSummary): AmbientSpeech | null {
  if (summary.projects === 0) return null;
  if (summary.busiestFolder) {
    return { kind: "waiting", folder: summary.busiestFolder, total: summary.active };
  }
  return summary.resolved > 0 ? { kind: "resolved" } : null;
}

/** The line for an event. Projects and comments come back with Undo; folders don't. */
export function reactionSpeech(event: SquiggyEvent): ReactionSpeech {
  switch (event.type) {
    case "comment-resolved":
      return { kind: "just-resolved" };
    case "project-created":
      return { kind: "just-created", projectName: event.projectName };
    case "item-deleted":
      return { kind: "just-deleted", undoable: event.item !== "folder" };
    case "save-failed":
      return { kind: "save-failed" };
  }
}

/** The reaction's line while it lasts, then the workspace's (or null, for the usual subline). */
export function currentSpeech(
  reaction: SquiggyEvent | null,
  summary: WorkspaceSummary | null,
): SquiggySpeech | null {
  if (reaction) return reactionSpeech(reaction);
  return summary ? squiggySpeech(summary) : null;
}

/** Longest project name quoted in full; longer ones are cut, so the bubble stays within the sizer. */
export const PROJECT_NAME_MAX = 32;

/**
 * `name`, or, past `PROJECT_NAME_MAX` characters, cut at the last space that
 * fits with "…" after it. A single word too long to fit is cut mid-word.
 */
export function shortProjectName(name: string): string {
  if (name.length <= PROJECT_NAME_MAX) return name;
  const room = name.slice(0, PROJECT_NAME_MAX - 1);
  const space = room.lastIndexOf(" ");
  const cut = space > 0 ? room.slice(0, space) : room;
  return `${cut.trimEnd()}…`;
}
