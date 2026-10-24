"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { duration, press } from "@/lib/motion";
import { buttonClass } from "../ui/button-styles";
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
  label?: string;
  /** Text of the link that opens the URL; null for none. */
  openLabel?: string | null;
  testId?: string;
  className?: string;
}

/** Read-only review URL with a copy button that reports success or failure. */
export function CopyLinkField({
  url,
  label = "Shareable review link",
  openLabel = "Open the preview with this link",
  testId = "review-link-url",
  className = "mt-8",
}: CopyLinkFieldProps) {
  const inputId = useId();
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const reduce = useReducedMotion();

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      timer.current = window.setTimeout(() => setState("idle"), RESET_MS);
    } catch {
      // Clipboard access can be denied (permissions, insecure context). Select the
      // text so a manual copy is one keystroke away; the hint stays until the next try.
      setState("error");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const button = LABELS[state];

  return (
    <div className={className}>
      <label htmlFor={inputId} className="text-body font-semibold">
        {label}
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef}
          id={inputId}
          aria-describedby={state === "error" ? hintId : undefined}
          data-testid={testId}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-12 flex-1 rounded-field bg-card px-4 font-mono text-body ring-1 ring-field-line ring-inset focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        />
        <motion.button
          type="button"
          onClick={() => void copy()}
          className={`${buttonClass(state === "error" ? "inverse" : "primary")} min-h-12 min-w-40`}
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
              <Icon name={button.icon} className="size-4" />
              {button.text}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
      {state === "error" ? (
        <p id={hintId} className="mt-3 text-meta text-muted" data-testid="copy-fallback-hint">
          Copying was blocked. The link is selected: press Ctrl/⌘+C to copy.
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {state === "copied"
          ? "Link copied to clipboard"
          : state === "error"
            ? "Couldn't copy automatically. The link is selected, so press Control or Command plus C to copy it."
            : ""}
      </p>
      {openLabel ? (
        <a
          href={url}
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-body font-semibold text-brand-text hover:underline"
        >
          {openLabel}
          <Icon name="external" className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
