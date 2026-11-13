"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { press, usePopVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { buttonClass } from "../ui/button-styles";
import { Icon } from "../ui/Icon";
import { copiedMessage, copyFailedMessage, smsHref, type OtherWay } from "./share-other-ways";

interface ShareOtherWaysProps {
  /** The invitation as a message (`inviteMessage`). */
  message: string;
  /** The bare link, for Copy link. */
  url: string;
  /**
   * Why the link can't take comments now (its review window closed), or null.
   * Then only Copy link stays: there's nothing to invite anyone to. The step
   * above says why (with Go to settings), so it isn't said again here.
   */
  unavailable: string | null;
}

type Notice = { way: OtherWay; ok: boolean } | null;

const RESET_MS = 4000;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Or send it another way": Messages opens with the invitation message (the
 * email's words, `inviteMessage`) and copies it too; Copy link copies the bare
 * link (lime, as the old Copy was). Each says what it did, in words and to
 * screen readers. Squint sends nothing itself.
 */
export function ShareOtherWays({ message, url, unavailable }: ShareOtherWaysProps) {
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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-semibold">Or send it another way</p>
      <div className="grid grid-cols-2 gap-2" data-testid="share-other-ways">
        {blocked ? null : (
          <motion.a
            href={smsHref(message)}
            onClick={() => {
              // Copied too, for a desktop without Messages: the link may open nothing.
              void copy(message).then((copied) => tell("messages", copied));
            }}
            className={`${buttonClass("secondary", "sm")} px-3`}
            {...(reduce ? {} : press)}
            data-testid="share-via-messages"
          >
            <Icon name="smartphone" className="size-4" />
            Messages
          </motion.a>
        )}
        <Button
          variant="lime"
          size="sm"
          // Alone when the review is closed: the full row, not half of it.
          className={`px-3 ${blocked ? "col-span-2" : ""}`}
          onClick={() => void copy(url).then((copied) => tell("link", copied))}
          data-testid="copy-share-link"
          data-url={url}
        >
          <Icon name="copy" className="size-4" />
          Copy link
        </Button>
      </div>
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
