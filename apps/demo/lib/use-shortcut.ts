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

/**
 * Single-key shortcut (no modifiers). Ignored while typing or while a modal
 * dialog is open, so it never steals keystrokes.
 */
export function useShortcut(key: string, onPress: () => void, enabled = true): void {
  const handler = useRef(onPress);
  useEffect(() => {
    handler.current = onPress;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      // composedPath sees through shadow roots (the review widget types inside one).
      if (event.key.toLowerCase() !== key || isTyping(event.composedPath()[0] ?? null)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, enabled]);
}
