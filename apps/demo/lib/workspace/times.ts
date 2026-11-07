/** A timestamptz as `pg` and PGlite return it (a Date), as epoch ms. */
export function toMs(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function toMsOrNull(value: Date | string | number | null): number | null {
  return value === null ? null : toMs(value);
}

/** Epoch ms as a timestamptz parameter. */
export function toDate(ms: number): Date {
  return new Date(ms);
}
