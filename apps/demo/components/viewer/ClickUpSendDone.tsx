"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { duration, ease, staggerGroup, usePopVariants, useRevealVariants } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { CopyLinkField } from "../review-link/CopyLinkField";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { ClickUpPreviewCard } from "./ClickUpPreviewCard";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import type { ClickUpSent } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY.done;

const STAGGER = staggerGroup();

/** How a step stands: done, failed, under way, or the one that's left. */
type Tone = "done" | "failed" | "busy" | "current";

/** Each tone's node on the track. */
const NODE: Record<Exclude<Tone, "current">, { icon: IconName; className: string }> = {
  done: { icon: "check", className: "bg-resolved-soft text-resolved-text ring-resolved-text" },
  failed: { icon: "alert", className: "bg-danger-soft text-danger ring-danger" },
  busy: { icon: "clock", className: "bg-card text-muted ring-line-strong" },
};

/** Touch screens paste by holding, not with keys. */
const TOUCH = "(pointer: coarse)";

/** macOS and Apple's other systems use ⌘ where others use Ctrl. */
function usesCommand(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

interface StepProps {
  tone: Tone;
  step: number;
  title: string;
  detail: string;
  /** The line to the next step: filled once this one's done. */
  last?: boolean;
  testId: string;
}

/**
 * One step on the track: its node (a check, an alert, a clock, or the lime
 * number of the step that's left, pulsing gently), its name and a word on
 * it, and the line on to the next step, drawn in once this one's done.
 */
function Step({ tone, step, title, detail, last = false, testId }: StepProps) {
  const reveal = useRevealVariants();
  const reduce = useReducedMotion();
  const node = tone === "current" ? null : NODE[tone];
  return (
    <motion.li
      variants={reveal}
      className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
      data-testid={testId}
      data-tone={tone}
    >
      {last ? null : (
        // From this node's center to the next one's, behind both.
        <span
          aria-hidden="true"
          className="absolute top-6 left-1/2 h-0.5 w-full -translate-y-1/2 overflow-hidden rounded-pill bg-line"
        >
          {tone === "done" ? (
            <motion.span
              className="block h-full origin-left bg-resolved-text"
              initial={{ scaleX: reduce ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: duration.page, ease: ease.out, delay: duration.micro }}
            />
          ) : null}
        </span>
      )}
      <span className="relative grid size-12 place-items-center">
        {tone === "current" && !reduce ? (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-pill bg-highlight"
            animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
            transition={{ duration: duration.loop, ease: ease.breathe, repeat: Infinity }}
          />
        ) : null}
        {node ? (
          <span
            aria-hidden="true"
            className={`relative grid size-12 place-items-center rounded-pill ring-2 ring-inset ${node.className}`}
          >
            <Icon name={node.icon} className="size-5" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="relative grid size-12 place-items-center rounded-pill bg-highlight text-heading font-extrabold text-on-highlight ring-2 ring-scene-ink ring-inset"
          >
            {step}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-semibold text-pretty">{title}</span>
        <span className="text-meta text-pretty text-muted wrap-anywhere">{detail}</span>
      </span>
    </motion.li>
  );
}

/** A key, as the paste panel shows it; `label` is how it's read out when its mark isn't a word. */
function Key({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <kbd className="inline-grid h-9 min-w-9 place-items-center rounded-field bg-card px-2 font-sans text-body font-semibold ring-1 ring-line-strong ring-inset">
      {label ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </kbd>
  );
}

/** Something that went wrong, under the track: what, why, and the way on. */
function Problem({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId: string;
}) {
  const pop = usePopVariants();
  return (
    <motion.div
      variants={pop}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col gap-2 rounded-tile bg-danger-soft p-4"
      data-testid={testId}
    >
      <p className="flex items-center gap-2 text-body font-semibold text-danger">
        <Icon name="alert" className="size-4 shrink-0" />
        {title}
      </p>
      {children}
    </motion.div>
  );
}

interface ClickUpSendDoneProps {
  sent: ClickUpSent;
  /** The project link's card: what pasting the link makes ClickUp show. */
  cardSrc: string;
  projectName: string;
  onPostAgain: () => void;
  onPickAnother: () => void;
}

/**
 * The Send to ClickUp window after a send, drawn as the way it goes: a
 * track of three steps (Squint's message, the link copied, the paste that's
 * left), what went wrong under it with the way on (Try again or Pick
 * another channel; a field to copy the link from), and the paste itself
 * shown: the link in ClickUp's message box, the keys for this device, and
 * the card it turns into. The window's footer holds Copy link again, Open
 * ClickUp again and Done.
 */
export function ClickUpSendDone({
  sent,
  cardSrc,
  projectName,
  onPostAgain,
  onPickAnother,
}: ClickUpSendDoneProps) {
  const reveal = useRevealVariants();
  const pop = usePopVariants();
  const reduce = useReducedMotion();
  const touch = useMediaQuery(TOUCH);
  const howId = useId();
  const { channel, post } = sent;
  const command = usesCommand();

  const message: { tone: Tone; title: string } =
    post.status === "posted"
      ? { tone: "done", title: COPY.steps.posted }
      : post.status === "posting"
        ? { tone: "busy", title: COPY.steps.posting }
        : { tone: "failed", title: COPY.steps.notPosted };

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-5"
      data-testid="clickup-done"
    >
      <ol className="flex items-start gap-2" aria-label={COPY.track}>
        <Step
          tone={message.tone}
          step={1}
          title={message.title}
          detail={`#${channel.name}`}
          testId="clickup-done-message"
        />
        <Step
          tone={sent.copied ? "done" : "failed"}
          step={2}
          title={sent.copied ? COPY.steps.copied : COPY.steps.notCopied}
          detail={sent.copied ? COPY.steps.clipboard : COPY.steps.copyBelow}
          testId="clickup-done-link"
        />
        <Step
          tone="current"
          step={3}
          title={COPY.steps.paste}
          detail={COPY.steps.inClickUp}
          last
          testId="clickup-done-paste"
        />
      </ol>

      <AnimatePresence initial={false}>
        {post.status === "posted" && sent.assignee ? (
          <motion.p
            key="assignee"
            variants={pop}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-center gap-2 self-center rounded-pill bg-brand-soft py-1.5 pr-4 pl-1.5 text-meta font-semibold text-brand-text"
            data-testid="clickup-done-assignee"
          >
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-pill bg-card"
            >
              <Icon name="user" className="size-4" />
            </span>
            <span className="min-w-0 text-pretty">{COPY.assigned(sent.assignee)}</span>
          </motion.p>
        ) : null}
        {post.status === "failed" ? (
          <Problem key="post" title={COPY.notPosted} testId="clickup-done-post-problem">
            <p role="alert" className="text-meta text-danger wrap-anywhere">
              {post.message}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={post.next === "again" ? onPostAgain : onPickAnother}
              className="self-start max-sm:w-full"
              data-testid="clickup-done-retry"
            >
              <Icon name={post.next === "again" ? "refresh" : "undo"} className="size-4" />
              {post.next === "again" ? COPY.postAgain : COPY.pickAnother}
            </Button>
          </Problem>
        ) : null}
        {sent.copied ? null : (
          <Problem key="copy" title={COPY.notCopied} testId="clickup-done-copy-problem">
            <CopyLinkField
              url={sent.link}
              label={COPY.linkLabel}
              openLabel={null}
              testId="clickup-done-link-field"
              className=""
            />
          </Problem>
        )}
      </AnimatePresence>

      {/* The step that's left, shown: the link in ClickUp's message box, the keys, the card. */}
      <motion.section
        variants={reveal}
        aria-labelledby={howId}
        className="flex flex-col gap-4 rounded-card bg-tile p-4 ring-2 ring-brand ring-inset sm:p-5"
        data-testid="clickup-done-how"
      >
        <h3 id={howId} className="text-heading font-bold">
          {COPY.paste(channel.name)}
        </h3>
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            {/* ClickUp's message box, the link pasted in it, the cursor after it. */}
            <div
              aria-hidden="true"
              className="flex items-center gap-2 rounded-field bg-card px-3 py-3 ring-1 ring-line-strong ring-inset"
            >
              <span className="min-w-0 truncate text-meta text-brand-text">{sent.link}</span>
              <motion.span
                className="h-4 w-0.5 shrink-0 rounded-pill bg-ink"
                animate={reduce ? undefined : { opacity: [1, 0] }}
                transition={{
                  duration: duration.loop / 2,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              />
              <span className="ml-auto grid size-7 shrink-0 place-items-center rounded-pill bg-brand text-on-brand">
                <Icon name="send" className="size-3.5" />
              </span>
            </div>
            {touch ? (
              <p className="text-meta text-muted">{COPY.pasteTouch}</p>
            ) : (
              <p
                className="flex flex-wrap items-center gap-2 text-meta text-muted"
                data-testid="clickup-done-keys"
              >
                {command ? <Key label="Command">⌘</Key> : <Key>Ctrl</Key>}
                <span aria-hidden="true">+</span>
                <Key>V</Key>
                <span>{COPY.then}</span>
                <Key>{COPY.enter}</Key>
              </p>
            )}
          </div>
          <Icon name="arrow" className="size-6 justify-self-center text-muted max-sm:rotate-90" />
          <figure className="flex min-w-0 flex-col gap-2">
            <ClickUpPreviewCard src={cardSrc} alt={COPY.cardAlt(projectName)} />
            <figcaption className="text-meta text-muted">{COPY.card}</figcaption>
          </figure>
        </div>
      </motion.section>
    </motion.div>
  );
}
