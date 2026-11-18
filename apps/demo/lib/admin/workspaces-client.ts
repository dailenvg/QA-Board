/**
 * The browser side of the admin panel's workspace routes: what each answer
 * means on the Workspaces page. Never throws: a network failure is an
 * outcome too.
 */

import { adminWorkspaceApi, type AdminWorkspaceRoute } from "../routes";
import type { AdminWorkspace } from "./workspaces";

export type AdminActionError =
  /** The workspace is gone (or the session isn't the admin's any more). */
  | "not-found"
  /** A reset link was asked for, but the owner's account is deleted. */
  | "no-owner"
  /** Archive was asked for, but the owner scheduled the workspace for deletion. */
  | "deleting"
  /** Refused as it was sent (a quota outside the bounds). */
  | "invalid"
  | "signed-out"
  /** The request never reached Squint. */
  | "offline"
  /** Squint answered, but with an error of its own. */
  | "failed";

export type WorkspaceOutcome =
  { ok: true; workspace: AdminWorkspace } | { ok: false; error: AdminActionError };

export type ResetLinkOutcome =
  { ok: true; link: string; expiresAt: number } | { ok: false; error: AdminActionError };

type Method = "PUT" | "POST" | "DELETE";

async function send(
  method: Method,
  workspaceId: string,
  route: AdminWorkspaceRoute,
  body: object = {},
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: AdminActionError }> {
  let response: Response;
  try {
    response = await fetch(adminWorkspaceApi(workspaceId, route), {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  const parsed: unknown = await response.json().catch(() => null);
  const fields = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  if (response.ok) return { ok: true, body: fields };
  return { ok: false, error: errorOf(response.status, fields.error) };
}

function errorOf(status: number, code: unknown): AdminActionError {
  switch (status) {
    case 400:
      return "invalid";
    case 401:
      return "signed-out";
    case 404:
      return "not-found";
    case 409:
      if (code === "no-owner" || code === "deleting") return code;
      return "failed";
    default:
      return "failed";
  }
}

function isWorkspace(value: unknown): value is AdminWorkspace {
  return Boolean(value && typeof value === "object" && "id" in value && "status" in value);
}

async function workspaceCall(
  method: Method,
  workspaceId: string,
  route: AdminWorkspaceRoute,
  body?: object,
): Promise<WorkspaceOutcome> {
  const answer = await send(method, workspaceId, route, body);
  if (!answer.ok) return answer;
  const { workspace } = answer.body;
  return isWorkspace(workspace) ? { ok: true, workspace } : { ok: false, error: "failed" };
}

export function setWorkspaceQuota(workspaceId: string, quotaBytes: number) {
  return workspaceCall("PUT", workspaceId, "quota", { quotaBytes });
}

export function setWorkspaceSuspended(workspaceId: string, suspended: boolean) {
  return workspaceCall(suspended ? "PUT" : "DELETE", workspaceId, "suspension");
}

export function setWorkspaceArchived(workspaceId: string, archived: boolean) {
  return workspaceCall(archived ? "PUT" : "DELETE", workspaceId, "archive");
}

export async function createOwnerResetLink(workspaceId: string): Promise<ResetLinkOutcome> {
  const answer = await send("POST", workspaceId, "reset-link");
  if (!answer.ok) return answer;
  const { link, expiresAt } = answer.body;
  return typeof link === "string" && typeof expiresAt === "number"
    ? { ok: true, link, expiresAt }
    : { ok: false, error: "failed" };
}
