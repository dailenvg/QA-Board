"use client";

import { motion } from "motion/react";
import type { MouseEvent } from "react";
import { useRevealVariants } from "@/lib/motion";
import { setProjectArchived } from "@/lib/store/actions";
import type { Project } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { Button } from "../ui/Button";
import { shortDate } from "../ui/deletion-when";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/ToastProvider";

const COPY = {
  region: "Archived project",
  headline: "Archived.",
  deletes: "Deletes for good on",
  linkClosed: "Its review link is closed until you unarchive it.",
  unarchive: "Unarchive",
  unarchived: (name: string) => `Unarchived ${name}`,
} as const;

/**
 * A slim bar under the viewer's top bar while the project is archived: when it's
 * deleted for good, that its review link is closed (when it has one), and Unarchive.
 * Unarchiving takes effect at once, and the bar leaves (its exit lives in the
 * viewer's AnimatePresence).
 */
export function ArchivedBanner({ project }: { project: Project }) {
  const variants = useRevealVariants();
  const toast = useToast();
  // The date waits for the browser's clock and locale (`now` is 0 on the server).
  const now = useNow();
  const deletesOn = project.deleteAfter;

  const unarchive = (event: MouseEvent<HTMLButtonElement>) => {
    const hadFocus = document.activeElement === event.currentTarget;
    const result = setProjectArchived(project.id, false);
    toast(
      result.ok
        ? { message: COPY.unarchived(project.name) }
        : { tone: "error", message: result.error },
    );
    // The button leaves with the bar: focus goes to the project's title (the page's heading),
    // just before the top bar's controls, Share now among them, rather than to the page's top.
    if (result.ok && hadFocus) {
      requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>("h1");
        if (!heading) return;
        if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      });
    }
  };

  return (
    <motion.section
      aria-label={COPY.region}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      data-testid="archived-banner"
      className="shrink-0 rounded-panel bg-panel"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 pl-4">
        {/* Off on phones: the line keeps its width, so the bar stays two lines beside Unarchive. */}
        <Icon name="archive" className="size-4 shrink-0 text-ink-2 max-sm:hidden" />
        <p className="min-w-0 flex-1 py-1 text-body text-muted">
          <span className="font-semibold text-ink">{COPY.headline}</span>
          {deletesOn !== undefined && now ? (
            <>
              {" "}
              {COPY.deletes}{" "}
              <time dateTime={new Date(deletesOn).toISOString()} className="text-ink">
                {shortDate(deletesOn, now)}
              </time>
              .
            </>
          ) : null}
          {/* Read out on phones too, where there's no room to show it (and Share is hidden). */}
          {project.share ? <span className="max-sm:sr-only"> {COPY.linkClosed}</span> : null}
        </p>
        <Button variant="secondary" size="sm" onClick={unarchive} data-testid="unarchive">
          <Icon name="archiveRestore" className="size-4" />
          {COPY.unarchive}
        </Button>
      </div>
    </motion.section>
  );
}
