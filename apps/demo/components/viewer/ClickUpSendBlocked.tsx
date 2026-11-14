"use client";

import { useEffect, useRef } from "react";
import { ACCOUNT_CLICKUP_HREF } from "@/lib/routes";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { StateArt, type ArtScene } from "../ui/line-art/StateArt";
import { focusLost } from "./clickup-options";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import type { ClickUpBlocked } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY;

/** Each state's picture, title, words and way forward (none when the member can't fix it). */
const STATES: Record<
  ClickUpBlocked,
  { scene: ArtScene; title: string | null; body: string; action: string | null }
> = {
  "not-connected": { scene: "unplugged", ...COPY.notConnected },
  reconnect: { scene: "brokenLink", ...COPY.reconnect },
  unavailable: { scene: "blocked", title: null, body: COPY.unavailable, action: null },
};

/**
 * Send to ClickUp when the member can't send from here: not connected yet,
 * a token ClickUp refused (connect again), or ClickUp switched off on this
 * site. The first two lead to their ClickUp card in the profile settings.
 * Turned into mid-send (Send went with the form), it takes focus: its link,
 * else the window's Close button.
 */
export function ClickUpSendBlocked({ reason }: { reason: ClickUpBlocked }) {
  const { scene, title, body, action } = STATES[reason];
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusLost()) return;
    const view = root.current;
    const target =
      view?.querySelector<HTMLElement>("a[href]") ??
      view?.closest('[role="dialog"]')?.querySelector<HTMLElement>("button");
    target?.focus();
  }, []);
  return (
    <div
      ref={root}
      className="flex flex-col items-center gap-3 py-2 text-center"
      data-testid="clickup-send-blocked"
      data-reason={reason}
    >
      <StateArt scene={scene} size="sm" still />
      {title ? <h3 className="text-heading font-semibold text-pretty">{title}</h3> : null}
      <p className="max-w-sm text-body text-pretty text-muted">{body}</p>
      {action ? (
        <ButtonLink
          href={ACCOUNT_CLICKUP_HREF}
          className="mt-2 max-sm:w-full"
          testId="clickup-settings-link"
        >
          <Icon name="link" className="size-4" />
          {action}
        </ButtonLink>
      ) : null}
    </div>
  );
}
