import { vi } from "vitest";
import type { Database } from "@/lib/db/database";
import type { WorkspaceData } from "@/lib/workspace/types";
import { migratedPglite } from "./pglite";
import { routeFetch } from "./route-fetch";
import { addFolder, seat, TEST_AUTH_SECRET } from "./workspace-fixture";
import { call, workspaceFetch } from "./workspace-routes";

/** Answers a browser request instead of the server (a refusal, a stall), or null to let it through. */
export type Intercept = (request: Request) => Promise<Response> | null;

/**
 * A workspace with folder f1 and its signed-in owner, and fresh store and
 * action modules (their state is module-level) connected to it as the server
 * renders it. Browser requests go to the real route handlers, on `holder.db`
 * (the test file mocks `@/lib/db/database` to read it), unless `intercept()`
 * answers first. Call `vi.unstubAllGlobals()` and `vi.unstubAllEnvs()` after.
 */
export async function connectedWorkspace(
  holder: { db: Database | null },
  options: {
    setUp?: (db: Database, workspaceId: string) => Promise<void>;
    intercept?: () => Intercept | null;
  } = {},
) {
  vi.resetModules();
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubGlobal("BroadcastChannel", undefined);
  const db = await migratedPglite();
  holder.db = db;
  const owner = await seat(db, "acme");
  await addFolder(db, owner.workspaceId, "f1");
  await options.setUp?.(db, owner.workspaceId);
  const server = workspaceFetch(owner.cookie, routeFetch());
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const request = new Request(new URL(url, "http://localhost"), init);
    return options.intercept?.()?.(request) ?? server(input, init);
  });
  const snapshot = await call("GET", `/api/w/${owner.workspaceId}/snapshot`, {
    cookie: owner.cookie,
  });
  const store = await import("@/lib/workspace-client/workspace-store");
  const actions = await import("@/lib/store/actions");
  const notices: string[] = [];
  store.subscribeNotices((message) => notices.push(message));
  const start = { data: (await snapshot.json()) as WorkspaceData, links: [] };
  store.connectWorkspace(start);
  const data = () => {
    const state = store.getWorkspaceState();
    if (state.status !== "ready") throw new Error(`workspace ${state.status}`);
    return state.data;
  };
  return { db, owner, store, actions, notices, data, start };
}
