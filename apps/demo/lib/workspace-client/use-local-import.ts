import { useSyncExternalStore } from "react";
import { getBlob } from "../blob-store/blob-store";
import { call, jsonInit } from "../share-client/api";
import { emitSquiggy } from "../squiggy/events";
import { clearLocalData, readLocalData } from "../store/local-store";
import type { ImportResult } from "../workspace/import-data";
import { uploadWorkspaceBlob } from "./blob-upload";
import { deferImport, forgetImportDeferral, importDeferred } from "./import-deferral";
import {
  importLocalData,
  type ImportDeps,
  type ImportFailure,
  type ImportProgress,
  type ImportReport,
  type LocalImport,
} from "./import-local";
import { refreshWorkspace } from "./workspace-store";

/**
 * Where the offer to import this browser's local data stands, for
 * `ImportLocalData`. Module-level, like the workspace store, so an import
 * keeps going (and keeps showing) when the page under it changes from the
 * dashboard to the viewer. Nothing here clears local data except a finished
 * import (`importLocalData`) and an explicit, confirmed Discard.
 */

export interface LocalCounts {
  projects: number;
  folders: number;
  comments: number;
}

/** A view Discard can be asked from, and goes back to on Cancel. */
type DiscardableView =
  | { view: "offer"; counts: LocalCounts }
  | { view: "unreadable"; reason: string; raw: string }
  | { view: "failed"; failure: ImportFailure }
  | { view: "done"; report: ImportReport };

export type LocalImportState =
  | { view: "hidden" }
  | DiscardableView
  | { view: "importing"; progress: ImportProgress | null }
  | { view: "confirm-discard"; counts: LocalCounts | null; back: DiscardableView }
  | { view: "discarding"; counts: LocalCounts | null };

const HIDDEN: LocalImportState = { view: "hidden" };

let state: LocalImportState = HIDDEN;
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: LocalImportState): void {
  state = next;
  for (const listener of listeners) listener();
}

const countsOf = ({ data }: LocalImport): LocalCounts => ({
  projects: data.projects.length,
  folders: data.folders.length,
  comments: data.comments.length,
});

/** What the browser holds now, as the view that offers it; null when there's nothing. */
function offerView(): DiscardableView | null {
  const local = readLocalData();
  if (local.status === "found") return { view: "offer", counts: countsOf(local) };
  if (local.status === "unreadable")
    return { view: "unreadable", reason: local.reason, raw: local.raw };
  return null;
}

/** Shows the offer when this browser has local data and it wasn't put off until the next sign-in. */
export function checkLocalData(): void {
  if (state.view !== "hidden" || importDeferred()) return;
  const view = offerView();
  if (view) set(view);
}

function serverDeps(workspaceId: string): ImportDeps {
  return {
    send: (body) =>
      call<ImportResult>(
        `/api/w/${encodeURIComponent(workspaceId)}/import`,
        jsonInit("POST", body),
      ),
    upload: (projectId, key, blob) => uploadWorkspaceBlob(workspaceId, projectId, key, blob),
    readFile: getBlob,
    clear: clearLocalData,
    onProgress: (progress) => {
      if (state.view === "importing") set({ view: "importing", progress });
    },
  };
}

async function run(workspaceId: string): Promise<void> {
  // Read again: another tab may have imported or discarded it meanwhile.
  const local = readLocalData();
  if (local.status !== "found") {
    set(
      local.status === "unreadable"
        ? { view: "unreadable", reason: local.reason, raw: local.raw }
        : HIDDEN,
    );
    return;
  }
  set({ view: "importing", progress: null });
  let outcome: Awaited<ReturnType<typeof importLocalData>>;
  try {
    outcome = await importLocalData(local, serverDeps(workspaceId));
  } catch {
    outcome = { ok: false, failure: "server" };
  }
  // Whatever came in shows behind the dialog, finished or not.
  void refreshWorkspace();
  if (!outcome.ok) {
    set({ view: "failed", failure: outcome.failure });
    return;
  }
  // Only when something new arrived: a retry that found it all there already says nothing.
  if (outcome.report.moved) emitSquiggy({ type: "imported", partial: !outcome.report.cleared });
  set({ view: "done", report: outcome.report });
}

/** Imports into `workspaceId`; Retry runs it again, picking up where it stopped. */
export function startImport(workspaceId: string): Promise<void> {
  running ??= run(workspaceId).finally(() => {
    running = null;
  });
  return running;
}

/** "Not now": keeps the data and asks again after the next sign-in. */
export function importLater(): void {
  deferImport();
  set(HIDDEN);
}

/** Closes the summary. A copy kept because something was skipped is offered again next sign-in. */
export function finishImport(): void {
  if (state.view === "done" && !state.report.cleared) deferImport();
  set(HIDDEN);
}

export function askDiscard(): void {
  if (
    state.view !== "offer" &&
    state.view !== "unreadable" &&
    state.view !== "failed" &&
    state.view !== "done"
  ) {
    return;
  }
  const local = readLocalData();
  set({
    view: "confirm-discard",
    counts: local.status === "found" ? countsOf(local) : null,
    back: state,
  });
}

export function cancelDiscard(): void {
  if (state.view === "confirm-discard") set(state.back);
}

/** Deletes this browser's local data and images, once confirmed. */
export async function discardLocalData(): Promise<void> {
  if (state.view !== "confirm-discard") return;
  set({ view: "discarding", counts: state.counts });
  await clearLocalData();
  forgetImportDeferral();
  set(HIDDEN);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The offer's state now (what `useLocalImport` shows). */
export const getLocalImportState = (): LocalImportState => state;
const getServerState = () => HIDDEN;

export function useLocalImport(): LocalImportState {
  return useSyncExternalStore(subscribe, getLocalImportState, getServerState);
}
