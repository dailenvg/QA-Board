"use client";

import { useEffect, useRef } from "react";
import { ACCOUNT_CLICKUP_HREF } from "@/lib/routes";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import type { Mood } from "../brand/mascot/moods";
import { StateArt, type ArtScene } from "../ui/line-art/StateArt";
import { focusLost } from "./clickup-options";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import type { ClickUpBlocked } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY;

/** Each state's picture (and Squiggy's mood in it), title, words and way forward (none when the member can't fix it). */
const STATES: Record<
  ClickUpBlocked,
  { scene: ArtScene; mood?: Mood; title: string | null; body: string; action: string | null }
> = {
  "not-connected": { scene: "clickup", ...COPY.notConnected },
  reconnect: { scene: "clickup", mood: "surprised", ...COPY.reconnect },
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
  const { scene, mood, title, body, action } = STATES[reason];
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
      className="flex flex-col items-center gap-2 text-center"
      data-testid="clickup-send-blocked"
      data-reason={reason}
    >
      {/* The scene on its own stage, as the welcome stories sit on theirs. */}
      <div className="mb-3 flex w-full justify-center rounded-card bg-story-stage px-4 pt-6 pb-2">
        <StateArt scene={scene} mood={mood} size="xl" surface="card" still />
      </div>
      {title ? <h3 className="text-title font-bold text-pretty">{title}</h3> : null}
      <p className="max-w-xs text-body text-pretty text-muted">{body}</p>
      {action ? (
        <ButtonLink
          href={ACCOUNT_CLICKUP_HREF}
          className="mt-3 max-sm:w-full"
          testId="clickup-settings-link"
        >
          <Icon name="link" className="size-4" />
          {action}
        </ButtonLink>
      ) : null}
    </div>
  );
}
