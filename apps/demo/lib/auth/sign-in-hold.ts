import { AsyncLocalStorage } from "node:async_hooks";
import { APIError, isAPIError } from "better-auth/api";
import type { Queryable } from "../share/migrate";
import { signInHold, type SignInHold } from "./users";

/**
 * Keeps a session from starting for someone who can't sign in. Better Auth
 * runs it (`databaseHooks.session.create.before`) only once the password
 * checked out, so only the right password learns why (decision 20).
 */

/** The codes it refuses with, Squint's own so no Better Auth code is mistaken for one. */
const HOLD_CODES: Readonly<Record<SignInHold, string>> = {
  removed: "SQUINT_SIGN_IN_REMOVED",
  suspended: "SQUINT_SIGN_IN_SUSPENDED",
  gone: "SQUINT_SIGN_IN_GONE",
};

/** The sign-in's own clock (its `now`), for the 24 hours since a removal. */
const signInClock = new AsyncLocalStorage<number>();

/** Runs `signIn` with `now` as the time the hold is checked at. */
export function atSignInTime<T>(now: number, signIn: () => Promise<T>): Promise<T> {
  return signInClock.run(now, signIn);
}

/** The hook: refuses the session with the hold's code, or lets it start. */
export function holdSessions(db: Queryable) {
  return async ({ userId }: { userId: string }): Promise<void> => {
    const hold = await signInHold(db, userId, signInClock.getStore() ?? Date.now());
    if (hold) throw new APIError("FORBIDDEN", { code: HOLD_CODES[hold], message: hold });
  };
}

/** The hold `error` refused a session with, or null for any other error. */
export function holdOf(error: unknown): SignInHold | null {
  if (!isAPIError(error)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  const match = Object.entries(HOLD_CODES).find(([, value]) => value === code);
  return match ? (match[0] as SignInHold) : null;
}
