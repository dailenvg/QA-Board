import {
  dispatchSaved,
  dispatchToWorkspace,
  getWorkspaceState,
  subscribeWorkspace,
  type Result,
  type WorkspaceState,
} from "../workspace-client/workspace-store";
import type { Action } from "./reducer";

/**
 * The seam every view and action reads and changes the workspace through.
 * Its state is the signed-in workspace (`lib/workspace-client`): loaded from
 * the server, changed here at once, saved there in the background. Data an
 * earlier build kept in this browser is only read for import
 * (`local-store.ts`), never written.
 */

export type StoreState = WorkspaceState;
export type { Result };

const LOADING: StoreState = { status: "loading" };

export const subscribe = subscribeWorkspace;

export const getSnapshot = getWorkspaceState;

/**
 * Loading, outside `WorkspaceProvider`; inside it, `useSquint` shows the
 * server's render of the workspace instead.
 */
export function getServerSnapshot(): StoreState {
  return LOADING;
}

/** Applies an action at once; a refusal from the server rolls it back and says so. */
export function dispatch(action: Action): Result {
  return dispatchToWorkspace(action);
}

/** Applies an action at once and resolves once the server has it (or refused it, rolled back). */
export function dispatchConfirmed(action: Action): Promise<Result> {
  return dispatchSaved(action);
}
