"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { loginHref } from "@/lib/auth/next-path";
import { press } from "@/lib/motion";
import type { ImportFailure } from "@/lib/workspace-client/import-local";
import { Button } from "../../ui/Button";
import { buttonClass } from "../../ui/button-styles";
import { Icon } from "../../ui/Icon";
import { DiscardButton, ImportActions } from "./ImportActions";
import { ImportStep } from "./ImportStep";

interface ImportFailedProps {
  failure: ImportFailure;
  workspace: string;
  onRetry: () => void;
  onLater: () => void;
  onDiscard: () => void;
}

/** The import stopped: nothing local was removed. Retry (or sign in again), Not now, or Discard. */
export function ImportFailed({
  failure,
  workspace,
  onRetry,
  onLater,
  onDiscard,
}: ImportFailedProps) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <ImportStep testId="import-failed">
      {/* Not an alert: ImportLocalData announces the title and reason as this view opens. */}
      <p className="flex items-start gap-2 text-body text-ink-2">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" />
        <span className="min-w-0 wrap-anywhere">
          Nothing was removed from this browser. Anything already imported stays in {workspace}, and
          Retry picks up where it stopped.
        </span>
      </p>
      <ImportActions aside={<DiscardButton onClick={onDiscard} />}>
        <Button variant="secondary" onClick={onLater} data-testid="import-later">
          Not now
        </Button>
        {failure === "signed-out" ? (
          // A full page load: nothing of the ended session carries over.
          <motion.a
            href={loginHref(pathname)}
            className={buttonClass()}
            {...(reduce ? {} : press)}
            data-autofocus
          >
            Sign in again
          </motion.a>
        ) : (
          <Button onClick={onRetry} data-autofocus data-testid="import-retry">
            <Icon name="refresh" className="size-4" />
            Retry
          </Button>
        )}
      </ImportActions>
    </ImportStep>
  );
}
