"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { CopyLinkField } from "../review-link/CopyLinkField";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import type { ClickUpSent } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY.done;

const STAGGER = staggerGroup();

/** How a row stands: done, failed, under way, or the step that's left. */
type Tone = "done" | "failed" | "busy" | "current";

/** Each tone's mark beside the row's title. */
const MARK: Record<
  Exclude<Tone, "current">,
  { icon: "check" | "alert" | "clock"; className: string }
> = {
  done: { icon: "check", className: "bg-resolved-soft text-resolved-text" },
  failed: { icon: "alert", className: "bg-danger-soft text-danger" },
  busy: { icon: "clock", className: "bg-card text-muted" },
};

/** Touch screens paste by holding, not with keys. */
const TOUCH = "(pointer: coarse)";

/** macOS and Apple's other systems use ⌘ where others use Ctrl. */
function usesCommand(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

interface RowProps {
  tone: Tone;
  /** The row's number, shown in its badge while it's the step that's left. */
  step: number;
  title: string;
  children?: ReactNode;
  testId: string;
}

/** One row of the confirmation: its mark, what happened (or is left), and what to do about it. */
function Row({ tone, step, title, children, testId }: RowProps) {
  const reveal = useRevealVariants();
  const current = tone === "current";
  const mark = current ? null : MARK[tone];
  return (
    <motion.li
      variants={reveal}
      className={`flex gap-3 rounded-tile p-4 ${
        current ? "bg-card ring-2 ring-brand ring-inset" : "bg-tile"
      }`}
      data-testid={testId}
      data-tone={tone}
    >
      {mark ? (
        <span
          aria-hidden="true"
          className={`grid size-7 shrink-0 place-items-center rounded-pill ${mark.className}`}
        >
          <Icon name={mark.icon} className="size-4" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-pill bg-highlight text-label font-extrabold text-on-highlight ring-1 ring-scene-ink ring-inset"
        >
          {step}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-body font-semibold text-pretty">{title}</p>
        {children}
      </div>
    </motion.li>
  );
}

/** A key, as the paste row names it; `label` is how it's read out when its mark isn't a word. */
function Key({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <kbd
      aria-label={label}
      className="inline-grid min-w-7 place-items-center rounded-field bg-tile px-1.5 py-0.5 font-sans text-meta font-semibold ring-1 ring-line ring-inset"
    >
      {children}
    </kbd>
  );
}

interface ClickUpSendDoneProps {
  sent: ClickUpSent;
  onPostAgain: () => void;
  onPickAnother: () => void;
}

/**
 * The Send to ClickUp window after a send: what's done and what's left, as
 * three rows. Squint's message (posted, with who's assigned; under way
 * again; or why it didn't go, with Try again or Pick another channel), the
 * link (copied; or, when the browser wouldn't, a field to copy it from), and
 * the step that's left, highlighted: pasting it in the channel, with the
 * keys for this device, so ClickUp shows the card. The window's footer
 * holds Copy link again, Open ClickUp again and Done.
 */
export function ClickUpSendDone({ sent, onPostAgain, onPickAnother }: ClickUpSendDoneProps) {
  const touch = useMediaQuery(TOUCH);
  const { channel, post } = sent;
  const command = usesCommand();

  const message = (() => {
    switch (post.status) {
      case "posting":
        return (
          <Row
            tone="busy"
            step={1}
            title={COPY.posting(channel.name)}
            testId="clickup-done-message"
          />
        );
      case "posted":
        return (
          <Row tone="done" step={1} title={COPY.posted(channel.name)} testId="clickup-done-message">
            {sent.assignee ? (
              <p className="text-meta text-muted">{COPY.assigned(sent.assignee)}</p>
            ) : null}
          </Row>
        );
      case "failed":
        return (
          <Row tone="failed" step={1} title={COPY.notPosted} testId="clickup-done-message">
            <p role="alert" className="text-meta text-danger wrap-anywhere">
              {post.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={post.next === "again" ? onPostAgain : onPickAnother}
              className="mt-1 self-start max-sm:w-full"
              data-testid="clickup-done-retry"
            >
              <Icon name={post.next === "again" ? "refresh" : "undo"} className="size-4" />
              {post.next === "again" ? COPY.postAgain : COPY.pickAnother}
            </Button>
          </Row>
        );
    }
  })();

  return (
    <motion.ol
      variants={STAGGER}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-3"
      data-testid="clickup-done"
    >
      {message}
      {sent.copied ? (
        <Row tone="done" step={2} title={COPY.copied} testId="clickup-done-link">
          <p className="truncate text-meta text-muted" title={sent.link}>
            {sent.link}
          </p>
        </Row>
      ) : (
        <Row tone="failed" step={2} title={COPY.notCopied} testId="clickup-done-link">
          <p className="text-meta text-muted">{COPY.notCopiedHint}</p>
          <CopyLinkField
            url={sent.link}
            label={COPY.linkLabel}
            openLabel={null}
            testId="clickup-done-link-field"
            className="mt-1"
          />
        </Row>
      )}
      <Row tone="current" step={3} title={COPY.paste} testId="clickup-done-paste">
        {touch ? (
          <p className="text-meta text-muted">{COPY.pasteTouch}</p>
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-meta text-muted">
            {command ? <Key label="Command">⌘</Key> : <Key>Ctrl</Key>}
            <Key>V</Key>
            <span>{COPY.then}</span>
            <Key>{COPY.enter}</Key>
          </p>
        )}
        <p className="text-meta text-muted">{COPY.card}</p>
      </Row>
    </motion.ol>
  );
}
