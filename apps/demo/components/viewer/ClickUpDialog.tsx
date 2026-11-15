"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { messageProjectName } from "@/lib/integrations/clickup/message";
import { useSwapVariants } from "@/lib/motion";
import { projectCardHref } from "@/lib/routes";
import { useMediaQuery } from "@/lib/use-media-query";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { StateArt } from "../ui/line-art/StateArt";
import { ClickUpSendBlocked } from "./ClickUpSendBlocked";
import { ClickUpSendDone } from "./ClickUpSendDone";
import { ClickUpSendForm } from "./ClickUpSendForm";
import { ClickUpSendSkeleton } from "./ClickUpSendSkeleton";
import { focusLost } from "./clickup-options";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import type { ClickUpBlocked, useClickUpSend } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY;

/**
 * The lists didn't load: what went wrong, and Try again. Takes focus when
 * the control that had it went with the last view (a Try again that failed again).
 */
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const retry = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusLost()) retry.current?.focus();
  }, []);
  return (
    <div
      className="flex flex-col items-center gap-3 py-2 text-center"
      data-testid="clickup-send-load-error"
    >
      <StateArt scene="slow" size="sm" still />
      <p role="alert" className="max-w-sm text-body text-pretty text-muted">
        {message}
      </p>
      <Button ref={retry} variant="secondary" onClick={onRetry} className="max-sm:w-full">
        <Icon name="refresh" className="size-4" />
        {COPY.retry}
      </Button>
    </div>
  );
}

/** What's read out as the window turns into the way to settings (its heading, or its only line). */
const BLOCKED_SPOKEN: Record<ClickUpBlocked, string> = {
  "not-connected": COPY.notConnected.title,
  reconnect: COPY.reconnect.title,
  unavailable: COPY.unavailable,
};

/** Phones: a bottom sheet, and no focus jump into a field (it would raise the keyboard). */
const PHONE = "(max-width: 39.999rem)";

interface ClickUpDialogProps {
  open: boolean;
  onClose: () => void;
  project: { id: string; name: string };
  /** How the message names the member: their name in Squint, else their email. */
  sender: string;
  send: ReturnType<typeof useClickUpSend>;
}

/**
 * The Send to ClickUp window, laid out as the Share window is (a bottom
 * sheet on phones; from tablets up, a small scene of a message flying to
 * ClickUp beside the title, and numbered steps on tiles, in two columns on
 * wide screens): the form once the member's lists load (skeletons until
 * then), the way to their settings when they aren't connected or ClickUp
 * refused their token, or what went wrong with Retry, and after a send what's
 * done and the paste that's left (`ClickUpSendDone`). States swap in place,
 * and one live line says the ones nothing else does. Cancel and Copy link &
 * open ClickUp stay at the bottom while the form shows.
 */
export function ClickUpDialog({ open, onClose, project, sender, send }: ClickUpDialogProps) {
  const swap = useSwapVariants();
  const phone = useMediaQuery(PHONE);
  const formId = useId();
  const { lists, sent } = send;
  const ready = lists.status === "ready" && !sent;
  const done = useRef<HTMLButtonElement>(null);
  /** Copy link again, for a moment after it worked. */
  const [copiedAgain, setCopiedAgain] = useState(false);
  /** What the window shows: the lists' state, or the confirmation after a send. */
  const view = sent ? "done" : lists.status;

  useEffect(() => {
    // The form's button went with the form: focus lands on Done, with the steps above it.
    if (view === "done") done.current?.focus();
  }, [view]);

  useEffect(() => {
    if (!copiedAgain) return;
    const timer = window.setTimeout(() => setCopiedAgain(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copiedAgain]);

  const body = (() => {
    if (sent) {
      return (
        <ClickUpSendDone
          sent={sent}
          cardSrc={projectCardHref(project.id)}
          projectName={messageProjectName(project.name)}
          onPostAgain={() => void send.postAgain()}
          onPickAnother={send.pickAnother}
        />
      );
    }
    switch (lists.status) {
      case "loading":
        return <ClickUpSendSkeleton />;
      case "blocked":
        return <ClickUpSendBlocked reason={lists.reason} />;
      case "error":
        return <LoadError message={lists.message} onRetry={() => void send.retry()} />;
      case "ready":
        return (
          <ClickUpSendForm
            id={formId}
            channels={lists.channels}
            people={lists.people}
            draft={send.draft}
            onChange={send.update}
            project={project}
            sender={sender}
            sending={send.sending}
            channelError={send.channelError}
            refreshing={send.refreshing}
            repick={send.repick}
            onSend={send.send}
            onReload={() => void send.retry()}
            phone={phone}
          />
        );
    }
  })();

  // One live line for the window's changes that nothing else says (errors are alerts, and a
  // send that went closes the window with a toast): loading, the way to settings, sending.
  const spoken = sent
    ? sent.post.status === "posting"
      ? COPY.done.posting(sent.channel.name)
      : `${COPY.done.title}. ${COPY.done.opened(sent.channel.name)}`
    : lists.status === "loading"
      ? COPY.loading
      : lists.status === "blocked"
        ? BLOCKED_SPOKEN[lists.reason]
        : send.sending
          ? COPY.sending
          : "";

  const footer = ready ? (
    <div className="flex items-center justify-end gap-3">
      <Button variant="secondary" size="sm" onClick={onClose}>
        {COPY.cancel}
      </Button>
      <Button
        type="submit"
        form={formId}
        size="sm"
        aria-disabled={send.sending || undefined}
        className="max-sm:flex-1"
        data-testid="clickup-send"
      >
        <Icon name="copy" className="size-4" />
        {send.sending ? COPY.sending : COPY.send}
      </Button>
    </div>
  ) : sent ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void send.copyAgain().then(setCopiedAgain)}
        data-testid="clickup-copy-again"
      >
        <Icon name={copiedAgain ? "check" : "copy"} className="size-4" />
        {copiedAgain ? COPY.done.copiedAgain : COPY.done.copyAgain}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={send.openAgain}
        data-testid="clickup-open-again"
      >
        <Icon name="external" className="size-4" />
        {COPY.done.openAgain}
      </Button>
      <Button ref={done} size="sm" onClick={onClose} data-testid="clickup-done-close">
        {COPY.done.close}
      </Button>
    </div>
  ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={sent ? COPY.done.title : COPY.title}
      // Blocked, the scene says it (ClickUp's mark included): no description or header mark.
      description={
        sent
          ? COPY.done.opened(sent.channel.name)
          : lists.status === "blocked"
            ? undefined
            : COPY.description
      }
      testId="clickup-dialog"
      fitKeyboard
      sheet
      tall={lists.status === "loading" || ready}
      size={lists.status === "loading" || ready || sent ? "lg" : "md"}
      art={
        lists.status === "blocked" ? undefined : <StateArt scene="clickupSend" size="sm" still />
      }
      footer={footer}
    >
      {/* Always present, so each change is announced (a region added with its words isn't). */}
      <p role="status" className="sr-only">
        {spoken}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          variants={swap}
          initial="hidden"
          animate="visible"
          exit="exit"
          data-state={view}
          data-testid="clickup-dialog-body"
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </Dialog>
  );
}
