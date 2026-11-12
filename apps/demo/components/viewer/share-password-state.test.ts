import { describe, expect, it } from "vitest";
import {
  linkPasswordError,
  PASSWORD_CONTROL_START,
  passwordControl,
  passwordStatus,
  type PasswordControlEvent,
  type PasswordControlState,
} from "./share-password-state";

function run(...events: PasswordControlEvent[]): PasswordControlState {
  return events.reduce(passwordControl, PASSWORD_CONTROL_START);
}

describe("the Share dialog's password control", () => {
  it("opens the field, saves, and closes saying so", () => {
    const editing = run({ type: "edit" });
    expect(editing.panel).toBe("editing");
    const saving = passwordControl(editing, { type: "submit", change: "save" });
    expect(saving).toMatchObject({ panel: "editing", pending: "save" });
    expect(passwordStatus(saving)).toBe("Saving…");
    const saved = passwordControl(saving, { type: "succeeded" });
    expect(saved).toEqual({ panel: "closed", pending: null, error: null, done: "saved" });
    expect(passwordStatus(saved)).toBe("Password saved");
  });

  it("asks before removing, and says so once removed", () => {
    const asking = run({ type: "ask-remove" });
    expect(asking.panel).toBe("confirm-remove");
    const removed = run({ type: "ask-remove" }, { type: "submit", change: "remove" });
    expect(passwordStatus(removed)).toBe("Removing…");
    expect(passwordControl(removed, { type: "succeeded" })).toMatchObject({
      panel: "closed",
      done: "removed",
    });
  });

  it("stays open with the reason when a change fails, to try again", () => {
    const failed = run(
      { type: "edit" },
      { type: "submit", change: "save" },
      { type: "failed", error: "Didn't save." },
    );
    expect(failed).toEqual({ panel: "editing", pending: null, error: "Didn't save.", done: null });
    expect(passwordControl(failed, { type: "submit", change: "save" })).toMatchObject({
      pending: "save",
      error: null,
    });
  });

  it("starts nothing else, and closes nothing, while a change is on its way", () => {
    const saving = run({ type: "edit" }, { type: "submit", change: "save" });
    for (const event of [
      { type: "edit" },
      { type: "ask-remove" },
      { type: "cancel" },
      { type: "submit", change: "remove" },
    ] as const) {
      expect(passwordControl(saving, event)).toBe(saving);
    }
  });

  it("ignores an answer nothing is waiting for", () => {
    expect(run({ type: "succeeded" })).toEqual(PASSWORD_CONTROL_START);
    expect(run({ type: "failed", error: "x" })).toEqual(PASSWORD_CONTROL_START);
  });

  it("forgets the last outcome and error when opened again, or cancelled", () => {
    const saved = run({ type: "edit" }, { type: "submit", change: "save" }, { type: "succeeded" });
    expect(passwordControl(saved, { type: "edit" })).toEqual({
      ...PASSWORD_CONTROL_START,
      panel: "editing",
    });
    const failed = run(
      { type: "ask-remove" },
      { type: "submit", change: "remove" },
      { type: "failed", error: "x" },
    );
    expect(passwordControl(failed, { type: "cancel" })).toMatchObject({
      panel: "closed",
      error: null,
    });
  });
});

describe("a link's new password", () => {
  it("takes 8 to 128 characters, nothing else asked", () => {
    expect(linkPasswordError("")).toBe("Enter a password of at least 8 characters.");
    expect(linkPasswordError("1234567")).toBe("Use at least 8 characters.");
    expect(linkPasswordError("12345678")).toBeNull();
    expect(linkPasswordError("x".repeat(128))).toBeNull();
    expect(linkPasswordError("x".repeat(129))).toBe("Use at most 128 characters.");
  });
});
