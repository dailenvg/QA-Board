/**
 * "Not now" on the offer to import this browser's local data: remembered
 * until the next sign-in (`LoginForm` forgets it), so the offer comes back
 * then and never on every page in between. Kept beside the local data, in
 * this browser only; where storage is blocked the offer simply comes back.
 */

const KEY = "squint:import-later";

export function deferImport(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the offer shows again on the next page.
  }
}

export function importDeferred(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function forgetImportDeferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: there's nothing remembered to forget.
  }
}
