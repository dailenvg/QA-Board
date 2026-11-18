/**
 * The browser side of the Storage page's actions: the orphan check and Run
 * sweep. Never throws: a network failure is an outcome too.
 */

import type { ExpiryReport } from "../cron/expiry-steps";
import { ADMIN_ORPHANS_API, ADMIN_SWEEP_API } from "../routes";
import type { OrphanReport } from "./orphans";

export type StorageActionError =
  /** A run is under way already (the schedule's, or another tab's Run sweep). */
  | "running"
  | "signed-out"
  /** The session isn't the admin's any more. */
  | "not-found"
  /** The request never reached Squint. */
  | "offline"
  /** Squint answered, but with an error of its own. */
  | "failed";

export type StorageOutcome<T> = { ok: true; value: T } | { ok: false; error: StorageActionError };

function errorOf(status: number, code: unknown): StorageActionError {
  if (status === 401) return "signed-out";
  if (status === 404) return "not-found";
  return status === 409 && code === "running" ? "running" : "failed";
}

async function post(url: string): Promise<StorageOutcome<Record<string, unknown>>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  const parsed: unknown = await response.json().catch(() => null);
  const body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  return response.ok
    ? { ok: true, value: body }
    : { ok: false, error: errorOf(response.status, body.error) };
}

function isObjectWith(value: unknown, key: string): boolean {
  return Boolean(value && typeof value === "object" && key in value);
}

/** What the cleanup's file sweeps would delete now, deleting nothing. */
export async function requestOrphanCheck(): Promise<StorageOutcome<OrphanReport>> {
  const answer = await post(ADMIN_ORPHANS_API);
  if (!answer.ok) return answer;
  const { report } = answer.value;
  return isObjectWith(report, "complete")
    ? { ok: true, value: report as OrphanReport }
    : { ok: false, error: "failed" };
}

/** Runs the whole daily cleanup now, and resolves once it's done. */
export async function requestSweep(): Promise<StorageOutcome<ExpiryReport>> {
  const answer = await post(ADMIN_SWEEP_API);
  if (!answer.ok) return answer;
  const { report } = answer.value;
  return isObjectWith(report, "failed")
    ? { ok: true, value: report as ExpiryReport }
    : { ok: false, error: "failed" };
}
