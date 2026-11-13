"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { loginHref } from "@/lib/auth/next-path";
import { press, useRevealVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { buttonClass } from "../ui/button-styles";
import { Icon } from "../ui/Icon";
import { StateArt, type ArtScene } from "../ui/line-art/StateArt";

/**
 * Why the workspace can't be shown: the server couldn't read it, the session
 * ended, or the workspace is no longer this account's.
 */
export type WorkspaceErrorReason = "unavailable" | "signed-out" | "gone";

const COPY: Record<WorkspaceErrorReason, { title: string; body: string }> = {
  unavailable: {
    title: "We couldn't load your workspace",
    body: "Something went wrong on our side. Your projects are safe. Try again in a moment.",
  },
  "signed-out": {
    title: "You've been signed out",
    body: "Sign in again to keep working. A change made just now may not have been saved.",
  },
  gone: {
    title: "This workspace isn't available",
    body: "This account no longer has access to it. Try again to see what you can open now.",
  },
};

/** Each reason's line-art scene: unplugged, locked out, or a link that no longer opens. */
const SCENE: Record<WorkspaceErrorReason, ArtScene> = {
  unavailable: "unplugged",
  "signed-out": "locked",
  gone: "brokenLink",
};

/** The way back: sign in again, or reload the page (with a busy state while it does). */
function Recovery({ reason }: { reason: WorkspaceErrorReason }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [reloading, setReloading] = useState(false);
  if (reason === "signed-out") {
    // A full page load, not a client navigation: nothing of the ended session carries over.
    return (
      <motion.a
        href={loginHref(pathname)}
        className={buttonClass()}
        {...(reduce ? {} : press)}
        data-testid="workspace-sign-in"
      >
        Sign in again
      </motion.a>
    );
  }
  return (
    <Button
      aria-disabled={reloading}
      onClick={() => {
        if (reloading) return;
        setReloading(true);
        window.location.reload();
      }}
      data-testid="workspace-retry"
    >
      <Icon name="refresh" className="size-4" />
      {reloading ? "Reloading…" : "Try again"}
    </Button>
  );
}

/**
 * Full-page state for a workspace that can't be shown, with a way to recover.
 * It can replace the page mid-session (the session ends on a save), taking the
 * focused element with it: focus then moves to the heading, so keyboard and
 * screen reader users start from the error rather than the top of the document.
 */
export function WorkspaceError({ reason }: { reason: WorkspaceErrorReason }) {
  const variants = useRevealVariants();
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const { title, body } = COPY[reason];

  useEffect(() => {
    const active = document.activeElement;
    // Only when focus was lost; never pull it out of something still on screen (a toast's action).
    if (!active || active === document.body) heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={variants}
        initial="hidden"
        animate="visible"
        aria-labelledby={titleId}
        data-testid="workspace-error"
        data-reason={reason}
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-panel bg-panel px-6 py-12 text-center"
      >
        <StateArt scene={SCENE[reason]} />
        {/* The alert is the message alone: not the mascot's name, not the button. */}
        <div role="alert">
          <h1 id={titleId} ref={heading} tabIndex={-1} className="text-title font-bold">
            {title}
          </h1>
          <p className="mt-2 text-body text-muted">{body}</p>
        </div>
        <Recovery reason={reason} />
      </motion.section>
    </main>
  );
}
