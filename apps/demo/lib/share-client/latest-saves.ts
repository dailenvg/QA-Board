import type { Result } from "../store/store";
import { SAVE_FAILED } from "../workspace-client/mutations";

/**
 * How a burst of saves of one setting ended, once none is in flight: the value
 * to show (the newest the server confirmed, or what it had before the burst)
 * and, when the newest choice was refused, why. `null` while a newer save is
 * still on its way: its answer decides.
 */
export type SavesSettled<T> = { value: T; error: string | null } | null;

export interface LatestSaves<T> {
  /**
   * Sends a change from `from` (what the server has, as far as the caller
   * knows) to `to`. Resolves once it's answered: with how the burst ended
   * if it was the last one in flight, else null.
   */
  save(from: T, to: T, send: () => Promise<Result>): Promise<SavesSettled<T>>;
}

/** Saves sent while others were in flight, from the first until the last has answered. */
interface Burst<T> {
  /** What the server had when the burst began. */
  before: T;
  /** The newest save the server confirmed. */
  confirmed: { version: number; value: T } | null;
  /** Why the newest save was refused; null when it wasn't (or hasn't answered). */
  newestError: string | null;
}

/**
 * Saves of one setting that may overlap (arrowing through a radio group sends
 * one per step), settled so the newest choice wins: an older save's failure
 * never undoes a newer choice, and a refused newest choice falls back to the
 * newest value the server confirmed, never to one it refused.
 */
export function createLatestSaves<T>(): LatestSaves<T> {
  let version = 0;
  let inFlight = 0;
  let burst: Burst<T> | null = null;

  return {
    async save(from, to, send) {
      burst ??= { before: from, confirmed: null, newestError: null };
      const current = burst;
      version += 1;
      const mine = version;
      inFlight += 1;
      const result = await send().catch((): Result => ({ ok: false, error: SAVE_FAILED }));
      inFlight -= 1;
      if (result.ok && (!current.confirmed || mine > current.confirmed.version)) {
        current.confirmed = { version: mine, value: to };
      }
      if (mine === version) current.newestError = result.ok ? null : result.error;
      if (inFlight > 0) return null;
      burst = null;
      const value = current.confirmed ? current.confirmed.value : current.before;
      return { value, error: current.newestError };
    },
  };
}
