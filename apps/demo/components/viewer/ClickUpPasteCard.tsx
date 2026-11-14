"use client";

import { messageProjectName } from "@/lib/integrations/clickup/message";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ClickUpPreviewCard } from "./ClickUpPreviewCard";
import { ShareStep } from "./ShareStep";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";

const COPY = CLICKUP_SEND_COPY.paste;

interface ClickUpPasteCardProps {
  projectName: string;
  /** The project link's card (`/p/<id>/opengraph-image`): what pasting the link shows. */
  cardSrc: string;
  /** The channel picked, by name; null for none yet. */
  channel: string | null;
  /** A send is on its way: held until it answers. */
  busy: boolean;
  onCopy: () => void;
}

/**
 * The other way to post the project: by hand, so it shows its card. ClickUp
 * unfurls a link into its card only when it's pasted in ClickUp, never in a
 * message sent through its API, so this copies the link and opens the
 * channel picked for the member to paste it. An unnumbered tile under the
 * steps, with the card it shows.
 */
export function ClickUpPasteCard({
  projectName,
  cardSrc,
  channel,
  busy,
  onCopy,
}: ClickUpPasteCardProps) {
  return (
    <ShareStep step={null} title={COPY.title} testId="clickup-paste">
      <p className="text-body text-pretty text-muted" data-testid="clickup-paste-body">
        {COPY.body(channel)}
      </p>
      <ClickUpPreviewCard src={cardSrc} alt={COPY.card(messageProjectName(projectName))} />
      <Button
        variant="secondary"
        onClick={onCopy}
        aria-disabled={busy || undefined}
        className="self-start max-sm:w-full"
        data-testid="clickup-copy-open"
      >
        <Icon name="copy" className="size-4" />
        {COPY.action}
      </Button>
    </ShareStep>
  );
}
