"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { duration, press } from "@/lib/motion";
import { BUTTON_BASE } from "../ui/ButtonLink";
import { Icon, type IconName } from "../ui/Icon";

type CopyState = "idle" | "copied" | "error";

const LABELS: Record<CopyState, { text: string; icon: IconName }> = {
  idle: { text: "Copy link", icon: "copy" },
  copied: { text: "Copied", icon: "check" },
  error: { text: "Copy failed", icon: "alert" },
};
const RESET_MS = 2500;

interface CopyLinkFieldProps {
  url: string;
}

/** Read-only review URL with a copy button that reports success or failure. */
export function CopyLinkField({ url }: CopyLinkFieldProps) {
  const inputId = useId();
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("error");
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), RESET_MS);
  };

  const label = LABELS[state];

  return (
    <div className="mt-10">
      <label htmlFor={inputId} className="text-small font-semibold">
        Shareable review link
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          data-testid="review-link-url"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-12 flex-1 rounded-2xl bg-raised px-4 font-mono text-small ring-1 ring-rule-strong ring-inset focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
        <motion.button
          type="button"
          onClick={() => void copy()}
          className={`${BUTTON_BASE} min-w-40 ${
            state === "error"
              ? "bg-ink text-paper"
              : "bg-accent text-on-accent hover:bg-accent-hover"
          }`}
          {...(reduce ? {} : press)}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={state}
              className="inline-flex items-center gap-2"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: duration.micro }}
            >
              <Icon name={label.icon} className="size-4" />
              {label.text}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
      <p aria-live="polite" className="sr-only">
        {state === "copied"
          ? "Link copied to clipboard"
          : state === "error"
            ? "Could not copy the link"
            : ""}
      </p>
      <a
        href={url}
        className="mt-4 inline-flex min-h-11 items-center gap-2 text-small font-medium text-accent hover:underline"
      >
        Open the preview with this link
        <Icon name="external" className="size-4" />
      </a>
    </div>
  );
}
