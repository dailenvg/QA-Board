import { SHARE_LIMITS } from "@/lib/share/limits";

/**
 * The Share dialog's password control, apart from the password itself (which
 * only its field holds, and only until it's sent).
 */

/** What's open under the control: nothing, the password field, or the question before removing. */
export type PasswordPanel = "closed" | "editing" | "confirm-remove";

export interface PasswordControlState {
  panel: PasswordPanel;
  /** A change on its way to the server; nothing else starts until it answers. */
  pending: "save" | "remove" | null;
  /** Why the last change didn't happen; it stays open to try again. */
  error: string | null;
  /** What the last change did, said once in the control's status line. */
  done: "saved" | "removed" | null;
}

export type PasswordControlEvent =
  | { type: "edit" }
  | { type: "ask-remove" }
  | { type: "cancel" }
  | { type: "submit"; change: "save" | "remove" }
  | { type: "succeeded" }
  | { type: "failed"; error: string };

export const PASSWORD_CONTROL_START: PasswordControlState = {
  panel: "closed",
  pending: null,
  error: null,
  done: null,
};

/**
 * The control's next state. While a change is on its way nothing else starts
 * (no overlapping saves) and nothing closes, so its answer always has a
 * place to show.
 */
export function passwordControl(
  state: PasswordControlState,
  event: PasswordControlEvent,
): PasswordControlState {
  if (state.pending && event.type !== "succeeded" && event.type !== "failed") return state;
  switch (event.type) {
    case "edit":
      return { ...PASSWORD_CONTROL_START, panel: "editing" };
    case "ask-remove":
      return { ...PASSWORD_CONTROL_START, panel: "confirm-remove" };
    case "cancel":
      return { ...state, panel: "closed", error: null };
    case "submit":
      return { ...state, pending: event.change, error: null, done: null };
    case "succeeded":
      if (!state.pending) return state;
      return {
        ...PASSWORD_CONTROL_START,
        done: state.pending === "save" ? "saved" : "removed",
      };
    case "failed":
      if (!state.pending) return state;
      return { ...state, pending: null, error: event.error };
  }
}

/** The status line beside the control's label: what's happening, or what just happened. */
export function passwordStatus(state: PasswordControlState): string {
  if (state.pending === "save") return "Saving…";
  if (state.pending === "remove") return "Removing…";
  if (state.done === "saved") return "Password saved";
  if (state.done === "removed") return "Password removed";
  return "";
}

/** A new password for the link, checked on blur and before it's sent: 8 to 128 characters. */
export function linkPasswordError(value: string): string | null {
  const { min, max } = SHARE_LIMITS.password;
  if (!value) return `Enter a password of at least ${min} characters.`;
  if (value.length < min) return `Use at least ${min} characters.`;
  if (value.length > max) return `Use at most ${max} characters.`;
  return null;
}
