"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { loginHref } from "@/lib/auth/next-path";
import { useRevealVariants } from "@/lib/motion";
import { Squiggy } from "../brand/mascot/Squiggy";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";

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
    body: "This account no longer has access to it. Reload to see what you can open now.",
  },
};

/** The way back: sign in again, or reload the page (with a busy state while it does). */
function Recovery({ reason }: { reason: WorkspaceErrorReason }) {
  const pathname = usePathname();
  const [reloading, setReloading] = useState(false);
  if (reason === "signed-out") {
    return (
      <ButtonLink href={loginHref(pathname)} testId="workspace-sign-in">
        Sign in again
      </ButtonLink>
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

/** Full-page state for a workspace that can't be shown, with a way to recover. */
export function WorkspaceError({ reason }: { reason: WorkspaceErrorReason }) {
  const variants = useRevealVariants();
  const { title, body } = COPY[reason];
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={variants}
        initial="hidden"
        animate="visible"
        role="alert"
        data-testid="workspace-error"
        data-reason={reason}
        className="flex w-full max-w-md flex-col items-center gap-5 rounded-panel bg-panel px-6 py-10 text-center"
      >
        <Squiggy mood="surprised" size={120} followCursor={false} />
        <div>
          <h1 className="text-title font-bold">{title}</h1>
          <p className="mt-2 text-body text-muted">{body}</p>
        </div>
        <Recovery reason={reason} />
      </motion.section>
    </main>
  );
}
