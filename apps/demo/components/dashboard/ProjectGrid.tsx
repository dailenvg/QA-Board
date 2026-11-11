"use client";

import { AnimatePresence, motion } from "motion/react";
import { duration, staggerGroup } from "@/lib/motion";
import type { ProjectSummary } from "@/lib/store/selectors";
import { ProjectCard, type ProjectCardActions } from "./ProjectCard";

interface ProjectGridProps extends ProjectCardActions {
  summaries: readonly ProjectSummary[];
  canMove: boolean;
  now: number;
}

const stagger = staggerGroup();

/** A project card (ProjectCard), found by its project's id. */
const CARD = "li[data-project-id]";

function cardOf(projectId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`li[data-project-id="${CSS.escape(projectId)}"]`);
}

/** A card's link (its title), the one thing in it that takes focus besides its menu. */
function linkOf(card: Element | null | undefined): HTMLElement | null {
  return card?.querySelector<HTMLElement>("h2 a") ?? null;
}

/** The page's heading, made focusable for this: where focus goes when there's nowhere better. */
function focusHeading(): void {
  const heading = document.querySelector<HTMLElement>("main h1");
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

/**
 * For a card about to leave the grid (archived, or unarchived under Archived) by an action from
 * its own menu: call it before the change, and the function it returns once the change worked.
 * If focus was in that card, it then moves to the next card's link (else the previous one's,
 * else the page's heading) once the card has gone, so it never drops to the page's top
 * (WCAG 2.4.3).
 */
export function cardFocusHandoff(projectId: string): () => void {
  const card = cardOf(projectId);
  if (!card?.contains(document.activeElement)) return () => {};
  const cards = Array.from(card.parentElement?.querySelectorAll(CARD) ?? []);
  const index = cards.indexOf(card);
  const next = linkOf(cards[index + 1]) ?? linkOf(cards[index - 1]);
  return () =>
    requestAnimationFrame(() => {
      if (next?.isConnected) next.focus();
      else focusHeading();
    });
}

/**
 * How long, in ms, a card coming back may take to appear: the folder's empty state leaving
 * first (FolderView), then the grid coming in.
 */
const RETURN_WAIT = (duration.micro + duration.component) * 1000;

/**
 * Puts focus on `projectId`'s card link once it's back in the grid (Undo in a toast), as the
 * toast and its button go away. Checks each frame until the card is there (the page's heading
 * if it doesn't come, such as when a filter leaves it out).
 */
export function focusProjectCard(projectId: string): void {
  const start = performance.now();
  const attempt = () => {
    // Only while focus is on the toast or already lost: never pull it from where it's gone since.
    const active = document.activeElement;
    const adrift =
      !active || active === document.body || active.closest('[role="status"], [role="alert"]');
    if (!adrift) return;
    const link = linkOf(cardOf(projectId));
    if (link) link.focus();
    else if (performance.now() - start < RETURN_WAIT) requestAnimationFrame(attempt);
    else focusHeading();
  };
  requestAnimationFrame(attempt);
}

/**
 * Responsive card grid; cards stagger in on mount, glide to their new places when re-sorted
 * (`layout` on each card, off with reduced motion) and animate out when removed or filtered.
 * The grid itself fades out when its last card goes (the folder's empty state follows).
 */
export function ProjectGrid({ summaries, canMove, now, ...actions }: ProjectGridProps) {
  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, transition: { duration: duration.micro } }}
      aria-label="Projects"
      // `relative`: popLayout positions exiting cards against this list.
      className="relative grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4"
    >
      <AnimatePresence mode="popLayout">
        {summaries.map((summary) => (
          <ProjectCard
            key={summary.project.id}
            summary={summary}
            canMove={canMove}
            now={now}
            {...actions}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
