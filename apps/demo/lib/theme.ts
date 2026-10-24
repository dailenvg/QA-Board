export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "squint:theme";
const THEME_EVENT = "squint:theme-change";

/** Browser chrome color per theme; mirrors `--bg` in globals.css. */
export const THEME_COLOR: Record<Theme, string> = { light: "#e7e7ea", dark: "#0c0c0e" };

/**
 * Inline <head> script: applies the stored theme before first paint so a dark
 * visitor never sees a light flash. First visits stay light, not system.
 */
export const THEME_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})!=="dark")return;document.documentElement.dataset.theme="dark";document.addEventListener("DOMContentLoaded",function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${JSON.stringify(
  THEME_COLOR.dark,
)});});}catch(e){}})();`;

export function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked (private mode, policies); the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** `useSyncExternalStore` subscription: this tab's toggles plus changes from other tabs. */
export function subscribeTheme(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
