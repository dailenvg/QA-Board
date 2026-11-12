"use client";

import { motion } from "motion/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import {
  retryMessage,
  secondsUntil,
  unlockFeedback,
  unlockLink,
  unlockPasswordError,
} from "@/lib/share-client/unlock";
import { useRetryWait } from "@/lib/share-client/use-retry-wait";
import type { ClientBrand, ClientView } from "@/lib/share/types";
import { AuthField } from "../auth/AuthField";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { accentStyle } from "./brand-accent";
import { BrandMark } from "./BrandMark";

interface ShareLockedProps {
  token: string;
  brand: ClientBrand;
  /** Why the screen is back, such as the review having been open a moment ago; null on arrival. */
  notice: string | null;
  /** The right password: the review, read with the guest pass it earned. */
  onUnlocked: (view: ClientView) => void;
  /** The link stopped working (revoked or expired) while the screen was up. */
  onGone: () => void;
}

const STAGGER = staggerGroup();

/** Who's inviting: the company's name, or a neutral line on a link without one. */
function headingFor(brand: ClientBrand): string {
  return brand.custom ? `${brand.name} has invited you to review` : "You've been invited to review";
}

function submitLabel(submitting: boolean, failedToReach: boolean): string {
  if (submitting) return "Opening…";
  return failedToReach ? "Try again" : "Open review";
}

/**
 * A password-protected link opened without a valid guest pass: the company's
 * name and logo, and its password. Shows nothing of the project (no name,
 * pages or comments) and no way into anyone's workspace. The password is
 * sent once, by `fetch`, and never kept: not in storage, the address or a log.
 */
export function ShareLocked({ token, brand, notice, onUnlocked, onGone }: ShareLockedProps) {
  const reveal = useRevealVariants();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, startWait] = useRetryWait();
  /** The current wait's length as it started, in seconds: its message is announced then only. */
  const [waitLength, setWaitLength] = useState(0);
  const waiting = secondsLeft > 0;
  const blocked = submitting || waiting;
  // A live region must be on the page before its words, or screen readers skip them: the notice
  // (why the screen is back) follows a frame after the region.
  const [shownNotice, setShownNotice] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShownNotice(notice));
    return () => cancelAnimationFrame(frame);
  }, [notice]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    const invalid = unlockPasswordError(password);
    setFieldError(invalid);
    setFormError(null);
    if (invalid) {
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    const outcome = await unlockLink(token, password);
    if (outcome.ok) {
      // Stays "Opening…" while the review takes this screen's place.
      setPassword("");
      onUnlocked(outcome.view);
      return;
    }
    setSubmitting(false);
    if (outcome.reason === "gone") {
      onGone();
      return;
    }
    const feedback = unlockFeedback(outcome, Date.now());
    setFieldError(feedback.fieldError);
    setFormError(feedback.formError);
    if (feedback.retryAt !== null) {
      setWaitLength(secondsUntil(feedback.retryAt, Date.now()));
      startWait(feedback.retryAt);
    }
    if (feedback.clearField) setPassword("");
    if (feedback.fieldError) inputRef.current?.focus();
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-8">
      <motion.div
        variants={STAGGER}
        initial="hidden"
        animate="visible"
        style={accentStyle(brand.color)}
        className="flex w-full max-w-md flex-col"
      >
        <motion.section
          variants={reveal}
          aria-labelledby={titleId}
          data-testid="share-locked"
          className="relative flex w-full flex-col gap-6 overflow-hidden rounded-panel bg-panel px-5 py-8 shadow-float sm:px-8"
        >
          {brand.color ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 top-0 h-1 rounded-b-pill bg-guest-accent dark:bg-guest-accent-dark"
            />
          ) : null}
          {/* display: contents: only orchestrates, so the section's gap still spaces its children. */}
          <motion.div variants={STAGGER} className="contents">
            <motion.div variants={reveal} className="flex flex-col items-center gap-4 text-center">
              <span
                className="flex max-w-full min-w-0 items-center gap-3"
                data-testid="guest-brand"
              >
                <BrandMark token={token} brand={brand} />
                <span
                  className="min-w-0 text-heading font-bold tracking-tight wrap-anywhere"
                  data-testid="guest-brand-name"
                >
                  {brand.name}
                </span>
              </span>
              <div>
                <h1 id={titleId} className="text-title font-bold text-balance wrap-break-word">
                  {headingFor(brand)}
                </h1>
                <p className="mt-2 flex items-center justify-center gap-2 text-body text-pretty text-muted">
                  <Icon name="lock" className="size-4 shrink-0" />
                  Enter the password to open it.
                </p>
              </div>
            </motion.div>
            <motion.form
              variants={reveal}
              // Before hydration a submit posts nothing: the field has no name. Once hydrated,
              // the password goes by fetch only.
              method="post"
              onSubmit={(event) => void submit(event)}
              noValidate
              aria-busy={submitting}
              // No gap: the messages' live regions are always there, empty or not, so each
              // brings its own space only while it shows.
              className="flex flex-col"
              data-testid="share-unlock-form"
            >
              <FormAlert
                tone="info"
                message={shownNotice}
                testId="share-locked-notice"
                className="has-[p]:mb-4"
              />
              <AuthField
                label="Password"
                type="password"
                name=""
                autoComplete="current-password"
                autoFocus
                inputRef={inputRef}
                value={password}
                error={fieldError}
                onChange={(value) => {
                  setPassword(value);
                  if (fieldError) setFieldError(unlockPasswordError(value));
                }}
                onBlur={() =>
                  // Leaving it empty isn't a mistake until it's sent.
                  setFieldError((current) => (password ? unlockPasswordError(password) : current))
                }
                testId="share-password"
              />
              {/* The wait is announced as it starts; its minutes then count down without repeating it. */}
              <FormAlert
                message={waiting ? retryMessage(secondsLeft) : formError}
                motionKey={waiting ? "retry-wait" : undefined}
                quiet={waiting && secondsLeft < waitLength}
                testId="share-unlock-error"
                className="has-[p]:mt-4"
              />
              <Button
                type="submit"
                aria-disabled={blocked || undefined}
                className="mt-6"
                data-testid="share-unlock-submit"
              >
                {submitLabel(submitting, formError !== null)}
              </Button>
            </motion.form>
          </motion.div>
        </motion.section>
      </motion.div>
    </main>
  );
}
