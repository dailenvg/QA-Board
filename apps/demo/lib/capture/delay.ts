/** Resolves with `value` after `ms`, without keeping the process alive. */
export function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms).unref();
  });
}
