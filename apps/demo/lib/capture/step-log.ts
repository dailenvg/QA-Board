/** Logs that a capture step finished. */
export type StepLog = (step: string) => void;

/**
 * One line per step in the function logs, with the time since the previous
 * step and since the start: `squint capture 3f9c w1440: goto +812ms (1204ms)`.
 */
export function stepLog(label: string): StepLog {
  const start = performance.now();
  let last = start;
  return (step) => {
    const now = performance.now();
    const line = `squint capture ${label}: ${step} +${Math.round(now - last)}ms (${Math.round(now - start)}ms)`;
    // eslint-disable-next-line no-console -- step timings are meant for the function logs
    console.info(line);
    last = now;
  };
}
