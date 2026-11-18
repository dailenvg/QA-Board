"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { utcTime } from "@/lib/admin/utc-format";
import type { AdminWorkspace } from "@/lib/admin/workspaces";
import type { ResetLinkOutcome } from "@/lib/admin/workspaces-client";
import { useSwapVariants } from "@/lib/motion";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FIELD_CLASS } from "../ui/field-styles";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.workspaces.reset;

/** How long Copy says Copied. */
const COPIED_MS = 2000;

type Phase =
  | { kind: "confirm"; making: boolean; error: string | null }
  | { kind: "ready"; link: string; expiresAt: number };

interface ResetLinkDialogProps {
  open: boolean;
  workspace: AdminWorkspace;
  onCreate: () => Promise<ResetLinkOutcome>;
  onClose: () => void;
}

/**
 * A password reset link for a workspace's owner (decision 2): first what it
 * is and that nothing is emailed, then, once made, the link with Copy, shown
 * this once. Closing forgets it. Stays up while it's made.
 */
export function ResetLinkDialog({ open, workspace, onCreate, onClose }: ResetLinkDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "confirm", making: false, error: null });
  const making = phase.kind === "confirm" && phase.making;
  const email = workspace.ownerEmail ?? ADMIN_COPY.workspaces.noOwner;
  const swap = useSwapVariants();
  // The ready step's words (when it stops working, shown only this once) describe the link's
  // field too: focus lands there, so screen readers hear them with it, not only on the dialog.
  const readyId = useId();

  const make = async () => {
    if (making) return;
    setPhase({ kind: "confirm", making: true, error: null });
    const outcome = await onCreate();
    setPhase(
      outcome.ok
        ? { kind: "ready", link: outcome.link, expiresAt: outcome.expiresAt }
        : { kind: "confirm", making: false, error: ADMIN_COPY.workspaces.errors[outcome.error] },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={COPY.title}
      description={
        phase.kind === "ready" ? (
          <span id={readyId}>{COPY.ready(utcTime(phase.expiresAt))}</span>
        ) : (
          COPY.description(email)
        )
      }
      size="sm"
      dismissible={!making}
      testId="reset-link-dialog"
    >
      {/* The first step slides out before the link slides in; focus stays on Make until then. */}
      <AnimatePresence mode="wait" initial={false}>
        {phase.kind === "ready" ? (
          <ReadyLink key="ready" link={phase.link} describedBy={readyId} onDone={onClose} />
        ) : (
          <motion.div
            key="confirm"
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            aria-busy={making || undefined}
          >
            <FormAlert message={phase.error} className="has-[p]:mb-4" testId="reset-link-error" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={making ? undefined : onClose}
                aria-disabled={making || undefined}
                data-autofocus
              >
                {COPY.cancel}
              </Button>
              <Button
                onClick={() => void make()}
                aria-disabled={making || undefined}
                data-testid="reset-link-create"
              >
                {making ? COPY.pending : COPY.confirm}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}

/** The link in a read-only field, selected and focused as it appears, with Copy and Done. */
function ReadyLink({
  link,
  describedBy,
  onDone,
}: {
  link: string;
  /** The dialog's ready words: when the link stops working, and that it's shown once. */
  describedBy: string;
  onDone: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const [copied, flashCopied] = useTimedFlag(COPIED_MS);
  const [copyFailed, setCopyFailed] = useState(false);
  const swap = useSwapVariants();

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  // Written inside the tap, before anything is awaited: Safari refuses the clipboard after.
  const copy = () => {
    let writing: Promise<void>;
    try {
      writing = navigator.clipboard.writeText(link);
    } catch {
      writing = Promise.reject(new Error("no clipboard"));
    }
    void writing.then(
      () => {
        setCopyFailed(false);
        flashCopied();
      },
      () => {
        setCopyFailed(true);
        field.current?.focus();
        field.current?.select();
      },
    );
  };

  return (
    <motion.div
      variants={swap}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col"
    >
      <label htmlFor={fieldId} className="mb-2 block text-body font-semibold">
        {COPY.label}
      </label>
      {/* Phones keep the field's 16px (FIELD_CLASS): under it, iOS zooms into the focused field. */}
      <input
        ref={field}
        id={fieldId}
        type="text"
        readOnly
        value={link}
        aria-describedby={describedBy}
        onFocus={(event) => event.currentTarget.select()}
        className={`${FIELD_CLASS} mb-5 font-mono sm:text-meta`}
        data-testid="reset-link-field"
      />
      <FormAlert
        message={copyFailed ? COPY.copyFailed : null}
        className="has-[p]:mb-4"
        testId="reset-link-copy-failed"
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} data-testid="reset-link-done">
          {COPY.done}
        </Button>
        {/* As wide as "Copy link" either way, so "Copied" doesn't shift Done (phones: full width). */}
        <Button onClick={copy} data-testid="reset-link-copy" className="sm:min-w-36">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? "copied" : "copy"}
              variants={swap}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="inline-flex items-center gap-2"
            >
              <Icon name={copied ? "check" : "copy"} className="size-5" />
              {copied ? COPY.copied : COPY.copy}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
      <p role="status" className="sr-only">
        {copied ? COPY.copied : ""}
      </p>
    </motion.div>
  );
}
