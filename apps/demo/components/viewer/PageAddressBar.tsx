"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePopVariants, useRevealVariants } from "@/lib/motion";
import { pagePath, resolvePageAddress } from "@/lib/page-address";
import { displayHost } from "@/lib/url";
import { Button } from "../ui/Button";
import { buttonClass } from "../ui/button-styles";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";

interface PageAddressBarProps {
  /** The project's address: pages must be on its origin. */
  siteUrl: string;
  /** The page under review (a `pageKey`). */
  page: string;
  /** Pages to offer, the project's own first (see `reviewedPages`). */
  pages: readonly string[];
  /** Active comments on each page, at every breakpoint. */
  counts: ReadonlyMap<string, number>;
  onNavigate: (pageUrl: string) => void;
}

const countLabel = (count: number) => (count === 1 ? "active comment" : "active comments");

/**
 * Which page of the website is under review, like a browser's address bar:
 * type or paste a path or an address on the same site (Enter goes there), or
 * pick a page already reviewed, each with its active comments. Escape puts
 * the current page back. Another site is refused inline, never framed or captured.
 */
export function PageAddressBar({ siteUrl, page, pages, counts, onNavigate }: PageAddressBarProps) {
  const inputId = useId();
  const errorId = useId();
  /** What's being typed; null shows the current page. */
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reveal = useRevealVariants();
  const pop = usePopVariants();
  const host = displayHost(siteUrl);
  const path = pagePath(page);
  const value = typed ?? path;
  const editing = typed !== null && typed.trim() !== path;

  const reset = () => {
    setTyped(null);
    setError(null);
  };

  const go = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = resolvePageAddress(value, siteUrl);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    reset();
    onNavigate(result.url);
  };

  // Like a field's inline validation: a finished entry that can't be opened says why on blur.
  const check = () => {
    if (!editing) return;
    const result = resolvePageAddress(value, siteUrl);
    setError(result.ok ? null : result.error);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape" || typed === null) return;
    // The field takes this Escape; the viewer's own (leave Comment mode) waits for the next.
    event.stopPropagation();
    reset();
  };

  return (
    <motion.nav
      variants={reveal}
      initial="hidden"
      animate="visible"
      aria-label="Page under review"
      data-testid="page-address-bar"
      // Above the snapshot bar (z-30) for the pages menu; below the top bar (z-40) and its menus.
      className="relative z-35 flex items-start gap-2 rounded-panel bg-panel p-2"
    >
      <form onSubmit={go} className="min-w-0 flex-1" noValidate>
        <div className="flex min-h-11 items-center rounded-field bg-card ring-1 ring-field-line transition-shadow ring-inset focus-within:ring-2 focus-within:ring-focus hover:ring-ink-2 has-[[aria-invalid]]:ring-2 has-[[aria-invalid]]:ring-danger">
          <label
            htmlFor={inputId}
            title={host}
            className="flex shrink-0 cursor-text items-center gap-2 py-2 pl-4 text-meta font-semibold text-muted"
          >
            <Icon name="globe" className="size-4 shrink-0" />
            <span className="sr-only">Page address on </span>
            <span className="max-w-24 truncate sm:max-w-48">{host}</span>
          </label>
          <input
            id={inputId}
            type="text"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            onFocus={(event) => event.target.select()}
            onBlur={check}
            onKeyDown={onKeyDown}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            data-testid="page-address"
            className="min-h-11 min-w-0 flex-1 bg-transparent pr-2 pl-1 text-nav text-ink placeholder:text-muted focus-visible:outline-none"
          />
          <AnimatePresence initial={false}>
            {editing ? (
              <motion.span
                key="go"
                variants={pop}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="pr-1"
              >
                <Button type="submit" variant="primary" size="sm" data-testid="page-go">
                  Go
                </Button>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <FieldError id={errorId} message={error} />
      </form>
      <Menu
        label={`Pages reviewed (${pages.length})`}
        icon="layers"
        text="Pages"
        testId="page-menu"
        triggerClassName={`${buttonClass("secondary", "sm")} aria-expanded:bg-hover max-sm:size-11 max-sm:px-0`}
        items={pages.map((entry) => {
          const count = counts.get(entry) ?? 0;
          return {
            label: pagePath(entry),
            checked: entry === page,
            count,
            countLabel: countLabel(count),
            onSelect: () => {
              reset();
              onNavigate(entry);
            },
          };
        })}
      />
      <p aria-live="polite" className="sr-only">
        Reviewing {path}
      </p>
    </motion.nav>
  );
}
