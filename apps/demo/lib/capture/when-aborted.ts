import { CaptureError } from "./capture-error";

/** Rejects with a `timeout` once `signal` aborts (at once if it already has). */
export function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new CaptureError("timeout"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
}
