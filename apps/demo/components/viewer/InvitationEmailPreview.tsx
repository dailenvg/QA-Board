"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePopVariants } from "@/lib/motion";
import { monogram } from "@/lib/monogram";
import { inviteCopy, type InviteDetails } from "@/lib/share/invite-copy";
import { Icon } from "../ui/Icon";

interface InvitationEmailPreviewProps {
  details: InviteDetails;
  /** Who it comes from, as the inbox shows it: "{Name} via Squint". */
  sender: string;
  /** The workspace's color for the sender's tile; null keeps navy. */
  color: string | null;
  /** Phones and narrow windows: the greeting, the invitation and the button only. */
  compact: boolean;
}

/**
 * What the client gets, as they'd see it: the invitation email (and the
 * message the other ways send, which says the same), from the copy in
 * `invite-copy.ts`, updating as the owner names the client and changes the
 * window or password. A picture of an email, drawn light in dark mode as a
 * screenshot would be. Its button does nothing.
 */
export function InvitationEmailPreview({
  details,
  sender,
  color,
  compact,
}: InvitationEmailPreviewProps) {
  const variants = usePopVariants();
  const copy = inviteCopy(details);
  const tile = monogram(details.company, color);
  const notes = [
    copy.deadline ? { key: "deadline", icon: "clock" as const, text: copy.deadline } : null,
    copy.passwordNote ? { key: "password", icon: "lock" as const, text: copy.passwordNote } : null,
  ].filter((note) => note !== null);
  return (
    <figure
      className="flex flex-col gap-3 rounded-card bg-story-stage p-4 sm:p-5"
      data-testid="invite-email-preview"
    >
      <figcaption className="text-label font-bold tracking-wide text-brand-text uppercase">
        {compact ? "Preview" : `What ${details.client ?? "your client"} gets`}
      </figcaption>
      <div className="mock-light flex flex-col gap-3 rounded-tile bg-card p-4 text-body text-ink shadow-float">
        {compact ? null : (
          <p className="flex min-w-0 items-center gap-2 text-meta text-muted">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-row text-label font-extrabold"
              style={{ background: tile.background, color: tile.ink }}
            >
              {tile.initials}
            </span>
            <span className="min-w-0 truncate" data-testid="invite-preview-from">
              {sender}
            </span>
          </p>
        )}
        <p data-testid="invite-preview-greeting">
          {details.client ? (
            <>
              Hi{" "}
              <mark className="rounded-kbd bg-highlight px-1 text-on-highlight">
                {details.client}
              </mark>
              ,
            </>
          ) : (
            copy.greeting
          )}
        </p>
        <p
          className={`font-bold text-balance wrap-break-word ${compact ? "text-nav" : "text-heading"}`}
          data-testid="invite-preview-headline"
        >
          {copy.headline}
        </p>
        <span
          aria-hidden="true"
          className="inline-flex min-h-10 w-max items-center rounded-pill bg-brand px-5 text-body font-semibold text-on-brand"
        >
          Open review
        </span>
        <AnimatePresence initial={false}>
          {compact
            ? null
            : notes.map((note) => (
                <motion.p
                  key={note.key}
                  layout
                  variants={variants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="flex items-start gap-2 text-meta text-muted"
                  data-testid={`invite-preview-${note.key}`}
                >
                  <Icon name={note.icon} className="mt-0.5 size-4 shrink-0" />
                  {note.text}
                </motion.p>
              ))}
        </AnimatePresence>
      </div>
      {compact ? null : (
        <p className="text-meta text-ink-2">
          The message Slack, ClickUp and Messages get says the same. The link preview in chats names
          the client and the project too.
        </p>
      )}
    </figure>
  );
}
