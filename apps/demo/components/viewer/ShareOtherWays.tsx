"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { press, usePopVariants } from "@/lib/motion";
import { useIsClient } from "@/lib/use-is-client";
import { Button } from "../ui/Button";
import { buttonClass } from "../ui/button-styles";
import { Icon, type IconName } from "../ui/Icon";
import {
  APP_URLS,
  copiedMessage,
  copyFailedMessage,
  smsHref,
  type OtherWay,
} from "./share-other-ways";

interface ShareOtherWaysProps {
  /** The invitation as a message (`inviteMessage`). */
  message: string;
  /** The bare link, for Copy link. */
  url: string;
  /** The invitation's subject, for the system share sheet. */
  title: string;
  /**
   * Why the link can't take comments now (its review window closed), or null.
   * Then only Copy link stays: there's nothing to invite anyone to.
   */
  unavailable: string | null;
}

type Notice = { way: OtherWay; ok: boolean } | null;

const RESET_MS = 4000;

const WAYS: ReadonlyArray<{ way: Exclude<OtherWay, "link">; label: string; icon: IconName }> = [
  { way: "clickup", label: "ClickUp", icon: "squareCheck" },
  { way: "slack", label: "Slack", icon: "messageSquare" },
  { way: "messages", label: "Messages", icon: "smartphone" },
];

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Whether this browser has a system share sheet (`navigator.share`). */
function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * "Or send it another way": ClickUp, Slack and Messages copy the invitation
 * message (the email's words, `inviteMessage`) and open the app; Copy link
 * copies the bare link (lime, as the old Copy was); More… opens the system
 * share sheet where there is one. Each says what it did, in words and to
 * screen readers. Squint sends nothing itself.
 */
export function ShareOtherWays({ message, url, title, unavailable }: ShareOtherWaysProps) {
  const isClient = useIsClient();
  const variants = usePopVariants();
  const reduce = useReducedMotion();
  const [notice, setNotice] = useState<Notice>(null);
  const timer = useRef<number | null>(null);
  const blocked = unavailable !== null;

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const tell = (way: OtherWay, ok: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setNotice({ way, ok });
    if (ok) timer.current = window.setTimeout(() => setNotice(null), RESET_MS);
  };

  const openApp = async (way: "clickup" | "slack") => {
    if (blocked) return;
    // Copied first: the new tab takes focus, and a page without it can't write the clipboard.
    const copied = await copy(message);
    tell(way, copied);
    if (copied) window.open(APP_URLS[way], "_blank", "noopener,noreferrer");
  };

  const share = async () => {
    if (blocked) return;
    try {
      await navigator.share({ title, text: message });
    } catch {
      // Dismissed, or refused: nothing to say.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-semibold">Or send it another way</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="share-other-ways">
        {blocked
          ? null
          : WAYS.map(({ way, label, icon }) =>
              way === "messages" ? (
                <motion.a
                  key={way}
                  href={smsHref(message)}
                  onClick={() => {
                    // Copied too, for a desktop without Messages: the link may open nothing.
                    void copy(message).then((copied) => tell(way, copied));
                  }}
                  className={buttonClass("secondary", "sm")}
                  {...(reduce ? {} : press)}
                  data-testid={`share-via-${way}`}
                >
                  <Icon name={icon} className="size-4" />
                  {label}
                </motion.a>
              ) : (
                <Button
                  key={way}
                  variant="secondary"
                  size="sm"
                  className="px-3"
                  onClick={() => void openApp(way)}
                  data-testid={`share-via-${way}`}
                >
                  <Icon name={icon} className="size-4" />
                  {label}
                </Button>
              ),
            )}
        <Button
          variant="lime"
          size="sm"
          className="px-3"
          onClick={() => void copy(url).then((copied) => tell("link", copied))}
          data-testid="copy-share-link"
        >
          <Icon name="copy" className="size-4" />
          Copy link
        </Button>
        {!blocked && isClient && canShare() ? (
          <Button
            variant="secondary"
            size="sm"
            className="col-span-2 px-3 sm:col-span-4"
            onClick={() => void share()}
            data-testid="share-via-system"
          >
            <Icon name="share" className="size-4" />
            More…
          </Button>
        ) : null}
      </div>
      {blocked ? <p className="text-meta text-muted">{unavailable}</p> : null}
      {/* Always there, so screen readers hear each confirmation. */}
      <div role="status" className="min-h-0" data-testid="share-other-ways-status">
        <AnimatePresence mode="wait" initial={false}>
          {notice ? (
            <motion.p
              key={`${notice.way}-${String(notice.ok)}`}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={`flex items-start gap-2 text-meta ${notice.ok ? "text-resolved-text" : "text-danger"}`}
            >
              <Icon name={notice.ok ? "check" : "alert"} className="mt-0.5 size-4 shrink-0" />
              {notice.ok ? copiedMessage(notice.way) : copyFailedMessage(notice.way)}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
