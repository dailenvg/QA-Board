"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { staggerGroup } from "@/lib/motion";
import type { CommentCounts } from "@/lib/store/status";
import type { Page } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { PageThumb } from "./PageThumb";

interface PageStripProps {
  pages: readonly Page[];
  /** 1-based number of the page shown. */
  number: number;
  counts: ReadonlyMap<string, CommentCounts>;
  onSelect: (pageId: string) => void;
  onStep: (step: -1 | 1) => void;
}

const stagger = staggerGroup(0.03, 0.04);

/**
 * Page switcher for projects with several pages: previous and next, "Page n
 * of N", and a thumbnail strip with each page's open comments. The current
 * thumbnail scrolls into view as pages change.
 */
export function PageStrip({ pages, number, counts, onSelect, onStep }: PageStripProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const first = number <= 1;
  const last = number >= pages.length;

  // Only the strip scrolls sideways: scrollIntoView would also scroll the page or panel.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !item) return;
    const bounds = list.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    const by =
      box.left < bounds.left
        ? box.left - bounds.left - 8
        : box.right > bounds.right
          ? box.right - bounds.right + 8
          : 0;
    if (by) list.scrollBy({ left: by, behavior: reduce ? "auto" : "smooth" });
  }, [number, reduce]);

  return (
    <nav
      aria-label="Pages"
      data-testid="page-strip"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-panel p-2"
    >
      <div className="flex items-center gap-1">
        {/*
         * aria-disabled, not disabled: at the first or last page the button keeps keyboard
         * focus instead of dropping it to the page. Stepping past either end does nothing.
         */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onStep(-1)}
          aria-disabled={first || undefined}
          aria-label="Previous page"
          title="Previous page ([)"
        >
          <Icon name="chevronLeft" className="size-5" />
        </Button>
        {/* The hidden widest text holds the width, so the buttons don't shift as numbers grow. */}
        <div className="grid min-w-24 text-center text-body font-semibold tabular-nums">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1">
            Page {pages.length} of {pages.length}
          </span>
          <p aria-live="polite" data-testid="page-position" className="col-start-1 row-start-1">
            Page {number} of {pages.length}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onStep(1)}
          aria-disabled={last || undefined}
          aria-label="Next page"
          title="Next page (])"
        >
          <Icon name="chevronRight" className="size-5" />
        </Button>
        <span className="hidden items-center gap-1 text-label text-muted xl:flex">
          <Kbd>[</Kbd>
          <Kbd>]</Kbd>
        </span>
      </div>
      <motion.ol
        ref={listRef}
        variants={stagger}
        initial="hidden"
        animate="visible"
        aria-label="All pages"
        // p-2: room for the thumbnails' focus rings and count badges inside the scroll box.
        className="flex min-w-0 flex-1 basis-64 gap-1 overflow-x-auto p-2"
      >
        {pages.map((page, index) => (
          <PageThumb
            key={page.id}
            page={page}
            number={index + 1}
            open={counts.get(page.id)?.active ?? 0}
            current={index + 1 === number}
            onSelect={() => onSelect(page.id)}
          />
        ))}
      </motion.ol>
    </nav>
  );
}
