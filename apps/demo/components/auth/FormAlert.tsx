"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePopVariants } from "@/lib/motion";
import { Icon } from "../ui/Icon";

interface AlertLink {
  /** Words of the message to turn into the link. */
  text: string;
  href: string;
}

interface FormAlertProps {
  /** Shown while set; the live region itself always stays so screen readers announce changes. */
  message: string | null;
  tone?: "error" | "info";
  /** A link inside the message, for the messages that contain its words. */
  link?: AlertLink;
  testId?: string;
  /** For the live region, such as space below it only while it shows (`has-[p]:mb-4`). */
  className?: string;
  /**
   * Keeps the message in place, without entering again, while its words change (a countdown).
   * Defaults to the message itself, so a different message pops in.
   */
  motionKey?: string;
  /**
   * Changes aren't announced while set: for a message already announced whose words only
   * count down, so screen readers don't repeat it every minute.
   */
  quiet?: boolean;
}

const TONES = {
  error: "bg-danger-soft text-danger",
  info: "bg-resolved-soft text-resolved-text",
};

/** `message`, with `link.text` in it (if it's there) as a link in the message's own colour. */
function linked(message: string, link: AlertLink | undefined): ReactNode {
  const at = link ? message.indexOf(link.text) : -1;
  if (!link || at < 0) return message;
  return (
    <>
      {message.slice(0, at)}
      <Link
        href={link.href}
        className="font-semibold underline decoration-current/40 underline-offset-4 transition-colors hover:decoration-current active:opacity-70"
      >
        {link.text}
      </Link>
      {message.slice(at + link.text.length)}
    </>
  );
}

/** A form-level message: an error (role="alert") or a notice (role="status"). */
export function FormAlert({
  message,
  tone = "error",
  link,
  testId,
  className,
  motionKey,
  quiet = false,
}: FormAlertProps) {
  const variants = usePopVariants();
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={quiet ? "off" : undefined}
      data-testid={testId}
      className={className}
    >
      <AnimatePresence initial={false}>
        {message ? (
          <motion.p
            key={motionKey ?? message}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`flex items-start gap-2 rounded-tile px-4 py-3 text-body font-medium ${TONES[tone]}`}
          >
            <Icon name={tone === "error" ? "alert" : "check"} className="mt-0.5 size-4 shrink-0" />
            {/* min-w-0 wrap-anywhere: messages can hold email addresses too long for a phone's line. */}
            <span className="min-w-0 wrap-anywhere">{linked(message, link)}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
