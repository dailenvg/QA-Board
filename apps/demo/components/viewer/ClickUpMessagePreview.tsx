"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { messageProjectName, noteParagraphs, SENT_FROM } from "@/lib/integrations/clickup/message";
import { usePopVariants } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { ClickUpPreviewCard } from "./ClickUpPreviewCard";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";

const COPY = CLICKUP_SEND_COPY.preview;

interface ClickUpMessagePreviewProps {
  projectName: string;
  /** The project's page, as the message gives it. */
  projectUrl: string;
  /** The link's card, as ClickUp unfurls it. */
  cardSrc: string;
  note: string;
  /** Who it's assigned to, by name; null for nobody. */
  assignee: string | null;
}

/**
 * The message as ClickUp's chat will show it: from you, the project's name
 * in bold, its address on a line of its own, the card it unfurls into, the
 * note's paragraphs, and "Sent for review from Squint", with who it's
 * assigned to underneath. Drawn from the same parts the server's Markdown is
 * (`clickUpMessage`), never from the Markdown itself; the address is shown,
 * not followed, so the preview stays in the window.
 */
export function ClickUpMessagePreview({
  projectName,
  projectUrl,
  cardSrc,
  note,
  assignee,
}: ClickUpMessagePreviewProps) {
  const titleId = useId();
  const pop = usePopVariants();
  const paragraphs = noteParagraphs(note);
  const name = messageProjectName(projectName);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2"
      data-testid="clickup-preview"
    >
      <h4 id={titleId} className="text-body font-semibold">
        {COPY.label}
      </h4>
      <div className="flex gap-3 rounded-tile bg-card p-4 ring-1 ring-line ring-inset">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand-text"
        >
          <Icon name="user" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-body wrap-anywhere">
          <p className="flex items-baseline gap-2">
            <span className="font-bold">{COPY.sender}</span>
            <span className="text-meta text-muted">{COPY.when}</span>
          </p>
          <p className="font-bold" data-testid="clickup-preview-project">
            {name}
          </p>
          {/*
            ClickUp's blue, but no underline and the default cursor: a mock of the message, so the
            address reads as what will be sent, not as a link to follow from here.
          */}
          <p className="cursor-default text-brand-text" data-testid="clickup-preview-url">
            {projectUrl}
          </p>
          <ClickUpPreviewCard src={cardSrc} alt={COPY.card(name)} />
          {paragraphs.map((lines, index) => (
            <p key={index} className="whitespace-pre-line" data-testid="clickup-preview-note">
              {lines.join("\n")}
            </p>
          ))}
          <p className="text-meta text-muted italic">{SENT_FROM}</p>
          <AnimatePresence initial={false}>
            {assignee ? (
              <motion.p
                key="assignee"
                variants={pop}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex max-w-full items-center gap-2 self-start rounded-pill bg-brand-soft py-1 pr-3 pl-1 text-meta font-semibold text-brand-text"
                data-testid="clickup-preview-assignee"
              >
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-pill bg-card"
                >
                  <Icon name="user" className="size-3.5" />
                </span>
                <span className="min-w-0 truncate">{COPY.assigned(assignee)}</span>
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
