"use client";

import { useId } from "react";
import { messageProjectName, noteParagraphs, SENT_FROM } from "@/lib/integrations/clickup/message";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";

const COPY = CLICKUP_SEND_COPY.preview;

interface ClickUpMessagePreviewProps {
  projectName: string;
  /** The project's page, as the message links it. */
  projectUrl: string;
  note: string;
  /** Who it's assigned to, by name; null for nobody. */
  assignee: string | null;
  followers: number;
}

/**
 * The message as ClickUp will show it, as it's written: the project's name
 * as a link (on one line, as sent), the note's paragraphs, and "Sent for
 * review from Squint", with who it's assigned to and how many follow it
 * underneath. Drawn from the same parts the server's Markdown is
 * (`clickUpMessage`), never from the Markdown itself.
 */
export function ClickUpMessagePreview({
  projectName,
  projectUrl,
  note,
  assignee,
  followers,
}: ClickUpMessagePreviewProps) {
  const titleId = useId();
  const paragraphs = noteParagraphs(note);
  const meta = [
    assignee ? COPY.assigned(assignee) : null,
    followers ? COPY.followers(followers) : null,
  ].filter(Boolean);
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2"
      data-testid="clickup-preview"
    >
      <h3 id={titleId} className="text-body font-semibold">
        {COPY.label}
      </h3>
      <div className="flex flex-col gap-2 rounded-tile bg-card p-4 text-body ring-1 ring-line ring-inset wrap-anywhere">
        <p>
          {/* Shown, not followed: the preview stays in the window. */}
          <span
            className="font-bold text-brand-text underline underline-offset-2"
            title={projectUrl}
            data-testid="clickup-preview-project"
          >
            {messageProjectName(projectName)}
          </span>
        </p>
        {paragraphs.map((lines, index) => (
          <p key={index} className="whitespace-pre-line" data-testid="clickup-preview-note">
            {lines.join("\n")}
          </p>
        ))}
        <p className="text-meta text-muted italic">{SENT_FROM}</p>
      </div>
      {meta.length ? (
        <p className="text-meta text-muted" data-testid="clickup-preview-meta">
          {meta.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
