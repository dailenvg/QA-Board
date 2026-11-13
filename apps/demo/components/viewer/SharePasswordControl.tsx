"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from "react";
import { usePopVariants } from "@/lib/motion";
import { absoluteTime, calendarDate } from "@/lib/relative-time";
import type { Result } from "@/lib/store/store";
import { AuthField } from "../auth/AuthField";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Switch } from "../ui/Switch";
import { ShareSettingRow } from "./ShareSettingRow";
import {
  linkPasswordError,
  PASSWORD_CONTROL_START,
  passwordControl,
  passwordStatus,
  type PasswordPanel,
} from "./share-password-state";

interface SharePasswordControlProps {
  /** When the link's password was set (epoch ms); undefined while it has none. */
  passwordSetAt: number | undefined;
  /** Sets the password, or with null removes it; resolves with the server's answer. */
  onChange: (password: string | null) => Promise<Result>;
  /** The link is on its way out (revoking): nothing can change. */
  disabled?: boolean;
}

const LABEL = "Password";

/** The controls that open a panel, by the event they send. */
type Trigger = "edit" | "ask-remove";

const PANEL_OF: Record<Trigger, PasswordPanel> = {
  edit: "editing",
  "ask-remove": "confirm-remove",
};

/**
 * Whether guests must enter a password to open the link, as a settings row
 * with a switch: switching it on opens the password field, switching it off
 * asks before removing it, and Change password opens the field again. The
 * password is typed once, sent once and never shown again; there's nothing to
 * copy. Removing asks first, here in the dialog.
 */
export function SharePasswordControl({
  passwordSetAt,
  onChange,
  disabled = false,
}: SharePasswordControlProps) {
  const [state, send] = useReducer(passwordControl, PASSWORD_CONTROL_START);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const variants = usePopVariants();
  const labelId = useId();
  const summaryId = useId();
  const panelId = useId();
  const confirmId = useId();
  const errorId = useId();
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /**
   * Set when the panel closes from inside: the button focus goes back to. Cancel returns to the
   * button that opened the panel; a saved or removed password, to Change or Add (the "edit" one).
   */
  const refocus = useRef<Trigger | null>(null);
  const isProtected = passwordSetAt !== undefined;
  const busy = state.pending !== null;
  const inactive = disabled || busy;

  useEffect(() => {
    const target = refocus.current;
    if (state.panel !== "closed" || !target) return;
    refocus.current = null;
    const buttons = root.current;
    (
      buttons?.querySelector<HTMLElement>(`[data-password-trigger="${target}"]`) ??
      buttons?.querySelector<HTMLElement>("[data-password-trigger]")
    )?.focus();
  }, [state.panel, isProtected]);

  const close = () => {
    if (busy) return;
    refocus.current = state.panel === "confirm-remove" ? "ask-remove" : "edit";
    setPassword("");
    setFieldError(null);
    send({ type: "cancel" });
  };

  /** Opens a panel; its own button pressed again closes it, as `aria-expanded` says it will. */
  const toggle = (event: Trigger) => {
    if (inactive) return;
    if (state.panel === PANEL_OF[event]) {
      close();
      return;
    }
    setPassword("");
    setFieldError(null);
    send({ type: event });
  };

  const settle = (result: Result) => {
    if (result.ok) {
      refocus.current = "edit";
      setPassword("");
      send({ type: "succeeded" });
    } else send({ type: "failed", error: result.error });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (inactive) return;
    const invalid = linkPasswordError(password);
    setFieldError(invalid);
    if (invalid) {
      input.current?.focus();
      return;
    }
    send({ type: "submit", change: "save" });
    settle(await onChange(password));
  };

  const remove = async () => {
    if (inactive) return;
    send({ type: "submit", change: "remove" });
    settle(await onChange(null));
  };

  // The switch shows where the owner is going: on while a first password is being typed, off
  // while removing it is being confirmed. Cancel puts it back.
  const switchedOn = isProtected ? state.panel !== "confirm-remove" : state.panel === "editing";
  const summary = isProtected ? (
    <span>
      On since{" "}
      <time dateTime={new Date(passwordSetAt).toISOString()} title={absoluteTime(passwordSetAt)}>
        {calendarDate(passwordSetAt)}
      </time>
      : guests enter it before they see anything
    </span>
  ) : (
    <span>Off: anyone with the link can open it</span>
  );

  return (
    <section ref={root} aria-labelledby={labelId} className="flex w-full flex-col">
      <ShareSettingRow
        icon="lock"
        titleId={labelId}
        title={LABEL}
        summary={<span data-testid="share-password-state">{summary}</span>}
        summaryId={summaryId}
        aside={
          <div className="flex shrink-0 items-center gap-2">
            <p role="status" className="text-meta text-muted" data-testid="share-password-status">
              {passwordStatus(state)}
            </p>
            <Switch
              checked={switchedOn}
              onChange={() => toggle(isProtected ? "ask-remove" : "edit")}
              labelledBy={labelId}
              describedBy={summaryId}
              inactive={inactive}
              controls={state.panel === "closed" ? undefined : panelId}
              data-password-trigger={isProtected ? "ask-remove" : "add"}
              testId="share-password-switch"
            />
          </div>
        }
      >
        {isProtected && state.panel !== "editing" ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => toggle("edit")}
            aria-disabled={inactive || undefined}
            aria-expanded={false}
            data-password-trigger="edit"
            data-testid="share-password-change"
          >
            Change password
          </Button>
        ) : null}
        <AnimatePresence initial={false} mode="wait">
          {state.panel === "editing" ? (
            <motion.form
              key="editing"
              id={panelId}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onSubmit={(event) => void save(event)}
              // Escape closes this first, as an open popup does, before the dialog.
              data-popup-open
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
              noValidate
              aria-busy={busy}
              className="flex flex-col gap-4 rounded-tile bg-panel p-4"
              data-testid="share-password-form"
            >
              <AuthField
                label={isProtected ? "New password" : "Password for this link"}
                type="password"
                autoComplete="new-password"
                autoFocus
                inputRef={input}
                value={password}
                error={fieldError ?? state.error}
                hint="8 to 128 characters. Send it to your clients separately from the link."
                readOnly={busy}
                onChange={(value) => {
                  setPassword(value);
                  if (fieldError) setFieldError(linkPasswordError(value));
                }}
                onBlur={() => setFieldError(password ? linkPasswordError(password) : null)}
                testId="share-password-input"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" size="sm" onClick={close} aria-disabled={busy || undefined}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  aria-disabled={inactive || undefined}
                  data-testid="share-password-save"
                >
                  {state.pending === "save" ? "Saving…" : "Save password"}
                </Button>
              </div>
            </motion.form>
          ) : state.panel === "confirm-remove" ? (
            <motion.div
              key="confirm-remove"
              id={panelId}
              role="group"
              aria-labelledby={confirmId}
              aria-describedby={errorId}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              data-popup-open
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
              className="flex flex-col gap-4 rounded-tile bg-panel p-4"
              data-testid="share-password-confirm"
            >
              <p id={confirmId} className="text-body text-ink">
                Remove the password? Anyone with the link will be able to open it again.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {/* Focused first, so Enter never removes it by accident. */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={close}
                  aria-disabled={busy || undefined}
                  autoFocus
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void remove()}
                  aria-disabled={inactive || undefined}
                  data-testid="share-password-remove-confirm"
                >
                  {state.pending === "remove" ? "Removing…" : "Remove password"}
                </Button>
              </div>
              <FieldError id={errorId} message={state.error} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </ShareSettingRow>
    </section>
  );
}
