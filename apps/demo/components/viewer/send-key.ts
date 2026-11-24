/** What `sendsOnEnter` reads from a keydown (React's, or the DOM's `KeyboardEvent`). */
export interface SendKey {
  key: string;
  shiftKey: boolean;
  /** True while an input method (Japanese, Chinese, Korean…) is composing a word. */
  isComposing: boolean;
  /** 229 on the Enter that ends a composition in Safari, which reports `isComposing` false. */
  keyCode?: number;
}

/** The keyCode browsers give a key the input method takes. */
const IME_KEY_CODE = 229;

/**
 * Whether a keydown in a reply (or comment) box sends it: Enter does (U2);
 * Shift+Enter adds a new line; an Enter that picks an input method's word
 * only picks it.
 */
export function sendsOnEnter(event: SendKey): boolean {
  return (
    event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== IME_KEY_CODE
  );
}
