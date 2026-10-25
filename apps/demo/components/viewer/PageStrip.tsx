"use client";

import { motion } from "motion/react";
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

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [number]);

  return (
    <nav
      aria-label="Pages"
      data-testid="page-strip"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-panel bg-panel p-2"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onStep(-1)}
          disabled={number <= 1}
          aria-label="Previous page"
          title="Previous page (PageUp or [)"
        >
          <Icon name="chevronLeft" className="size-5" />
        </Button>
        <p
          aria-live="polite"
          data-testid="page-position"
          className="min-w-24 text-center text-body font-semibold tabular-nums"
        >
          Page {number} of {pages.length}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onStep(1)}
          disabled={number >= pages.length}
          aria-label="Next page"
          title="Next page (PageDown or ])"
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
        className="flex min-w-0 flex-1 basis-64 gap-1 overflow-x-auto p-1"
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
