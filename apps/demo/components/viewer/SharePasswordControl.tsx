"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from "react";
import { usePopVariants } from "@/lib/motion";
import { absoluteTime, calendarDate } from "@/lib/relative-time";
import type { Result } from "@/lib/store/store";
import { AuthField } from "../auth/AuthField";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import {
  linkPasswordError,
  PASSWORD_CONTROL_START,
  passwordControl,
  passwordStatus,
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

/**
 * Whether guests must enter a password to open the link, and the way to add,
 * change or remove it. The password is typed once, sent once and never shown
 * again; there's nothing to copy. Removing asks first, here in the dialog.
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
  const panelId = useId();
  const confirmId = useId();
  const errorId = useId();
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Set when the panel closes from inside, so focus goes back to the button that opened it. */
  const refocus = useRef(false);
  const isProtected = passwordSetAt !== undefined;
  const busy = state.pending !== null;
  const inactive = disabled || busy;

  useEffect(() => {
    if (state.panel !== "closed" || !refocus.current) return;
    refocus.current = false;
    root.current?.querySelector<HTMLElement>("[data-password-trigger]")?.focus();
  }, [state.panel, isProtected]);

  const open = (event: "edit" | "ask-remove") => {
    if (inactive) return;
    setPassword("");
    setFieldError(null);
    send({ type: event });
  };

  const close = () => {
    if (busy) return;
    refocus.current = true;
    setPassword("");
    setFieldError(null);
    send({ type: "cancel" });
  };

  const settle = (result: Result) => {
    if (result.ok) {
      refocus.current = true;
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

  return (
    <section ref={root} aria-labelledby={labelId} className="flex w-full flex-col">
      {/* Same size and spacing as the review window's label above it. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 id={labelId} className="text-body font-semibold text-ink">
          {LABEL}
        </h3>
        <p
          role="status"
          className="shrink-0 text-meta text-muted"
          data-testid="share-password-status"
        >
          {passwordStatus(state)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p
          className="mr-auto flex min-w-0 items-start gap-2 text-meta text-muted"
          data-testid="share-password-state"
        >
          <Icon name={isProtected ? "lock" : "link"} className="mt-0.5 size-4 shrink-0" />
          {isProtected ? (
            <span>
              Protected since{" "}
              <time
                dateTime={new Date(passwordSetAt).toISOString()}
                title={absoluteTime(passwordSetAt)}
              >
                {calendarDate(passwordSetAt)}
              </time>
            </span>
          ) : (
            <span>Anyone with the link can open it.</span>
          )}
        </p>
        {isProtected ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => open("edit")}
              aria-disabled={inactive || undefined}
              aria-expanded={state.panel === "editing"}
              aria-controls={state.panel === "editing" ? panelId : undefined}
              data-password-trigger
              data-testid="share-password-change"
            >
              Change
            </Button>
            <Button
              variant="danger-ghost"
              size="sm"
              onClick={() => open("ask-remove")}
              aria-disabled={inactive || undefined}
              aria-expanded={state.panel === "confirm-remove"}
              aria-controls={state.panel === "confirm-remove" ? panelId : undefined}
              data-testid="share-password-remove"
            >
              Remove
            </Button>
          </div>
        ) : state.panel === "editing" ? null : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => open("edit")}
            aria-disabled={inactive || undefined}
            aria-expanded={false}
            data-password-trigger
            data-testid="share-password-add"
          >
            <Icon name="lock" className="size-4" />
            Add a password
          </Button>
        )}
      </div>
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
            className="mt-4 flex flex-col gap-4 rounded-tile bg-card p-4"
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
            className="mt-4 flex flex-col gap-4 rounded-tile bg-card p-4"
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
    </section>
  );
}
