"use client";

import { motion, useReducedMotion } from "motion/react";
import { instant, press, spring, useRevealVariants } from "@/lib/motion";
import { distinctPageName } from "@/lib/store/pages";
import type { Page } from "@/lib/store/types";
import { BlobImage } from "../ui/BlobImage";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";

interface PageThumbProps {
  page: Page;
  number: number;
  /** Open (unresolved) comments on the page. */
  open: number;
  current: boolean;
  onSelect: () => void;
}

const MISSING = (
  <span className="grid size-full place-items-center text-muted">
    <Icon name="image" className="size-4" />
  </span>
);

/** One page in the strip: its picture, number and open comments. The current one is marked. */
export function PageThumb({ page, number, open, current, onSelect }: PageThumbProps) {
  const reduce = useReducedMotion();
  const variants = useRevealVariants();
  const comments = open === 1 ? "1 open comment" : `${open} open comments`;
  const name = distinctPageName(page.name, number);
  return (
    // `initial`/`animate` come from the strip's list, so thumbnails stagger in on mount.
    <motion.li variants={variants} className="shrink-0">
      <motion.button
        type="button"
        onClick={onSelect}
        aria-current={current ? "page" : undefined}
        aria-label={`Page ${number}${name ? `, ${name}` : ""}${open ? `, ${comments}` : ""}`}
        title={page.name}
        data-testid="page-thumb"
        data-page={number}
        // A grow, not a lift: the strip scrolls sideways, so a lift would clip at its top edge.
        {...(reduce ? {} : press)}
        className="group relative flex flex-col items-center gap-1 rounded-tile p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {/* Smaller on phones, so the strip leaves the page itself more of the screen. */}
        <span className="relative block h-10 w-14 overflow-hidden rounded-row bg-card shadow-seg sm:h-14 sm:w-20">
          <BlobImage
            blobKey={page.blobKey}
            alt=""
            fill
            sizes="80px"
            className="object-cover object-top"
            pending={<Skeleton className="size-full" />}
            fallback={MISSING}
          />
          {current ? (
            <motion.span
              layoutId="page-thumb-current"
              transition={reduce ? instant : spring.snappy}
              className="pointer-events-none absolute inset-0 rounded-row ring-2 ring-brand-text ring-inset"
            />
          ) : null}
        </span>
        <span
          className={`text-label tabular-nums ${current ? "font-semibold text-ink" : "text-muted group-hover:text-ink"}`}
        >
          {number}
        </span>
        {open ? (
          <span
            aria-hidden="true"
            data-testid="page-thumb-count"
            className="absolute -top-0.5 -right-0.5 min-w-5 rounded-pill bg-card px-1.5 text-center text-label font-semibold text-comments-text tabular-nums shadow-seg ring-1 ring-comments"
          >
            {open}
          </span>
        ) : null}
      </motion.button>
    </motion.li>
  );
}
