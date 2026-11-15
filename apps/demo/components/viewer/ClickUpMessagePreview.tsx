"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { messageProjectName, noteParagraphs, sentBy } from "@/lib/integrations/clickup/message";
import { usePopVariants } from "@/lib/motion";
import { Icon } from "../ui/Icon";
import { ClickUpPreviewCard } from "./ClickUpPreviewCard";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";

const COPY = CLICKUP_SEND_COPY.preview;

interface ClickUpMessagePreviewProps {
  /** How the message names the member: their name in Squint, else their email. */
  sender: string;
  /** For the card's description. */
  projectName: string;
  /** The project's page: the link the member pastes. */
  projectUrl: string;
  /** The project link's card (`/p/<id>/opengraph-image`): what ClickUp shows for the pasted link. */
  cardSrc: string;
  note: string;
  /** Who it's assigned to, by name; null for nobody. */
  assignee: string | null;
}

/** One of the preview's two parts: its label, then what shows in ClickUp. */
function Part({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2" data-testid={testId}>
      <h5 id={labelId} className="text-meta font-semibold text-muted">
        {label}
      </h5>
      {children}
    </section>
  );
}

/**
 * What a send puts in the channel, in the order ClickUp will show it: first
 * Squint's message, from you (who sent it in bold, the note's paragraphs,
 * and who it's assigned to), then the link the member pastes under it and
 * the card ClickUp shows for it (a message sent through ClickUp's API never
 * gets one). Drawn from the same parts the server's Markdown is
 * (`clickUpMessage`), never from the Markdown itself; the address is shown,
 * not followed, so the preview stays in the window.
 */
export function ClickUpMessagePreview({
  sender,
  projectName,
  projectUrl,
  cardSrc,
  note,
  assignee,
}: ClickUpMessagePreviewProps) {
  const titleId = useId();
  const pop = usePopVariants();
  const paragraphs = noteParagraphs(note);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3"
      data-testid="clickup-preview"
    >
      <h4 id={titleId} className="text-body font-semibold">
        {COPY.label}
      </h4>
      <Part label={COPY.posts} testId="clickup-preview-message">
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
              {sentBy(sender)}
            </p>
            {paragraphs.map((lines, index) => (
              <p key={index} className="whitespace-pre-line" data-testid="clickup-preview-note">
                {lines.join("\n")}
              </p>
            ))}
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
      </Part>
      <Part label={COPY.paste} testId="clickup-preview-paste">
        <div className="flex flex-col gap-3 rounded-tile bg-card p-4 ring-1 ring-line ring-inset">
          {/*
            ClickUp's blue, but no underline and the default cursor: a mock of the channel, so the
            address reads as what you'll paste, not as a link to follow from here.
          */}
          <p
            className="cursor-default text-body text-brand-text wrap-anywhere"
            data-testid="clickup-preview-url"
          >
            {projectUrl}
          </p>
          <ClickUpPreviewCard src={cardSrc} alt={COPY.card(messageProjectName(projectName))} />
        </div>
      </Part>
    </section>
  );
}
