import type { Mood } from "@/components/brand/mascot/moods";
import { storageLevel, usedPercent } from "../account/storage-level";
import { activeData } from "../store/archive";
import type { SquintData } from "../store/types";
import type { StorageSummary } from "../workspace/types";
import type { SquiggyEvent, SquiggyEventRecord, SquiggyEventType } from "./events";

/**
 * Squiggy's mood, in layers (highest wins):
 * 1. Reaction: a one-shot mood after an event, for `REACTION_MS`. The latest replaces it.
 * 2. Attention: poked (happy wink), or New project hovered, focused or open (listening).
 * 3. Asleep: no input for `IDLE_SLEEP_MS`.
 * 4. Ambient: what the workspace looks like, held at least `AMBIENT_DWELL_MS`:
 *    stressed while its storage is nearly or entirely used up, else its comments.
 * Pure: no React, no DOM.
 */

/** How long a reaction shows: two beats of the Resolved hop. */
export const REACTION_MS = 2400;
/** The shortest time an ambient mood stays before the next one takes over. */
export const AMBIENT_DWELL_MS = 1500;
/** No pointer, keyboard, touch or wheel input for this long and Squiggy falls asleep. */
export const IDLE_SLEEP_MS = 60_000;
/** Input is noted at most this often (pointer moves and wheel fire many times a second). */
export const INPUT_THROTTLE_MS = 250;
/** How long a poke keeps Squiggy happy. */
export const POKE_MS = 1600;
/** Attention has to hold this long before Squiggy listens: a pointer passing over doesn't count. */
export const ATTENTION_SETTLE_MS = 150;
/** And Squiggy keeps listening this long after it ends, so moving between controls doesn't flicker. */
export const ATTENTION_RELEASE_MS = 400;
/** This many active comments or more, and Squiggy is surprised rather than thinking. */
export const BUSY_COMMENTS = 10;

export const REACTION_MOOD: Record<SquiggyEventType, Mood> = {
  "signed-in": "happy",
  "comment-resolved": "resolved",
  "project-created": "happy",
  "item-deleted": "surprised",
  "project-archived": "sleeping",
  "save-failed": "surprised",
  imported: "happy",
};

/** The folder holding the most active comments (directly, not in its subfolders). */
export interface BusiestFolder {
  id: string;
  name: string;
  active: number;
}

/** Storage that's running out: `near` from 80% of the quota, `over` once it's used up. */
export interface StorageStrain {
  level: "near" | "over";
  /** Whole percent of the quota used (`usedPercent`). */
  percent: number;
}

/** What the ambient mood and the speech line read from the workspace. */
export interface WorkspaceSummary {
  projects: number;
  active: number;
  resolved: number;
  /** Null when no comment is active. */
  busiestFolder: BusiestFolder | null;
  /** Null while there's room, or before the storage is known. */
  storage: StorageStrain | null;
}

/** How strained the workspace's storage is, or null while there's room (or it isn't known). */
export function storageStrain(storage: StorageSummary | null): StorageStrain | null {
  if (!storage) return null;
  const level = storageLevel(storage.bytes, storage.quotaBytes);
  return level === "ok" ? null : { level, percent: usedPercent(storage.bytes, storage.quotaBytes) };
}

/**
 * Counts projects and their comments, archived ones left out (as the Overview
 * leaves them out), and reads the storage. A tie for busiest goes to the older folder.
 */
export function squiggySummary(
  workspace: SquintData,
  storage: StorageSummary | null = null,
): WorkspaceSummary {
  const data = activeData(workspace);
  const folderOf = new Map(data.projects.map((project) => [project.id, project.folderId]));
  const activeByFolder = new Map<string, number>();
  let active = 0;
  let resolved = 0;
  for (const comment of data.comments) {
    const folderId = folderOf.get(comment.projectId);
    if (folderId === undefined) continue;
    if (comment.status === "resolved") {
      resolved += 1;
      continue;
    }
    active += 1;
    activeByFolder.set(folderId, (activeByFolder.get(folderId) ?? 0) + 1);
  }
  let busiestFolder: BusiestFolder | null = null;
  const byAge = [...data.folders].sort((a, b) => a.createdAt - b.createdAt);
  for (const folder of byAge) {
    const count = activeByFolder.get(folder.id) ?? 0;
    if (count > (busiestFolder?.active ?? 0)) {
      busiestFolder = { id: folder.id, name: folder.name, active: count };
    }
  }
  return {
    projects: data.projects.length,
    active,
    resolved,
    busiestFolder,
    storage: storageStrain(storage),
  };
}

/**
 * The workspace's mood. Storage running out beats everything else: Squiggy is
 * stressed. `engaged`: there has been input this visit; an empty workspace
 * sleeps until then.
 */
export function ambientMood(summary: WorkspaceSummary, engaged: boolean): Mood {
  if (summary.storage) return "stressed";
  if (summary.projects === 0) return engaged ? "idle" : "sleeping";
  if (summary.active >= BUSY_COMMENTS) return "surprised";
  if (summary.active > 0) return "thinking";
  if (summary.resolved > 0) return "happy";
  return "idle";
}

/** A poke beats New project's attention. Null when neither is happening. */
export function attentionMood({
  poked,
  listening,
}: {
  poked: boolean;
  listening: boolean;
}): Mood | null {
  if (poked) return "happy";
  return listening ? "listening" : null;
}

/** The event Squiggy is still reacting to at `now`, with the ms it has left, or null. */
export function activeReaction(
  latest: SquiggyEventRecord | null,
  now: number,
): { event: SquiggyEvent; remaining: number } | null {
  if (!latest) return null;
  const remaining = latest.at + REACTION_MS - now;
  return remaining > 0 ? { event: latest.event, remaining } : null;
}

export function reactionMood(event: SquiggyEvent): Mood {
  return REACTION_MOOD[event.type];
}

export interface MoodLayers {
  reaction: Mood | null;
  attention: Mood | null;
  ambient: Mood;
  asleep: boolean;
}

/** The mood to show: the highest layer that has something to say. */
export function resolveMood({ reaction, attention, ambient, asleep }: MoodLayers): Mood {
  return reaction ?? attention ?? (asleep ? "sleeping" : ambient);
}

/** Ms until a mood shown since `since` may give way, 0 when it already may. */
export function dwellRemaining(since: number, now: number): number {
  return Math.max(0, since + AMBIENT_DWELL_MS - now);
}
