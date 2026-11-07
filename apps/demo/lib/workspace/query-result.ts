/** A query's refusal, mapped to a status by the route. */
export type Refusal =
  | "not-found"
  | "exists"
  | "unknown-folder"
  | "unknown-parent"
  | "unknown-surface"
  | "cycle"
  | "not-empty"
  | "linked"
  | "quota"
  | "too-large"
  | "wrong-kind"
  | "not-uploaded";

export type QueryResult<T> = { ok: true; value: T } | { ok: false; reason: Refusal };

export const done = <T>(value: T): QueryResult<T> => ({ ok: true, value });
export const refuse = (reason: Refusal): { ok: false; reason: Refusal } => ({ ok: false, reason });
