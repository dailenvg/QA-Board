import { useEffect, useRef } from "react";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

interface ShortcutOptions {
  /** Pressed with ⌘ or Ctrl held, as in ⌘K / Ctrl+K. Without it, any of them held skips it. */
  mod?: boolean;
}

/**
 * Keyboard shortcut: a single key, or ⌘/Ctrl plus a key with `mod`. Ignored
 * while typing or while a modal dialog is open, so it never steals keystrokes.
 */
export function useShortcut(
  key: string,
  onPress: () => void,
  enabled = true,
  { mod = false }: ShortcutOptions = {},
): void {
  const handler = useRef(onPress);
  useEffect(() => {
    handler.current = onPress;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const held = event.metaKey || event.ctrlKey;
      if (held !== mod || event.altKey || event.repeat) return;
      // composedPath sees through shadow roots (the review widget types inside one).
      if (event.key.toLowerCase() !== key || isTyping(event.composedPath()[0] ?? null)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, enabled, mod]);
}
