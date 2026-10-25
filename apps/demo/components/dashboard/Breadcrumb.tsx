"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OVERVIEW_HREF, folderHref } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import { Icon } from "../ui/Icon";

interface BreadcrumbProps {
  /** The folders above the current one, from the top level down. */
  ancestors: readonly Folder[];
  current: Folder;
}

/** With more folders above than this, the middle ones fold behind a "…" button. */
const SHOWN_ANCESTORS = 2;

const CRUMB =
  "inline-flex min-h-11 max-w-40 items-center truncate rounded-pill px-2 text-body font-medium text-muted transition-colors hover:bg-hover hover:text-ink active:bg-seg sm:max-w-56";

function Separator() {
  return <Icon name="chevronRight" className="size-4 shrink-0 text-muted" />;
}

/**
 * Where a folder sits: Overview › parents › this folder (the current page,
 * not a link). Deep paths keep the first and last parent and fold the middle
 * behind "…", which unfolds them in place. Wraps on narrow screens.
 */
export function Breadcrumb({ ancestors, current }: BreadcrumbProps) {
  const [unfolded, setUnfolded] = useState(false);
  /** The first folder "…" stood for, which takes focus once it shows. */
  const revealed = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (unfolded) revealed.current?.focus();
  }, [unfolded]);
  const folds = !unfolded && ancestors.length > SHOWN_ANCESTORS;
  const hidden = folds ? ancestors.slice(1, -1) : [];
  const shown = folds ? [ancestors[0], ancestors.at(-1)] : ancestors;

  const crumbs = shown.flatMap((folder, index) => {
    if (!folder) return [];
    const link = (
      <li key={folder.id} className="flex min-w-0 items-center gap-1">
        <Separator />
        <Link
          ref={unfolded && index === 1 ? revealed : undefined}
          href={folderHref(folder.id)}
          scroll={false}
          className={CRUMB}
        >
          {folder.name}
        </Link>
      </li>
    );
    if (!(folds && index === 0)) return [link];
    return [
      link,
      <li key="folded" className="flex items-center gap-1">
        <Separator />
        <button
          type="button"
          onClick={() => setUnfolded(true)}
          aria-label={`Show ${hidden.length} more ${hidden.length === 1 ? "folder" : "folders"}`}
          className={`${CRUMB} justify-center`}
        >
          …
        </button>
      </li>,
    ];
  });

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="-ml-2">
      <ol className="flex flex-wrap items-center gap-x-1">
        <li className="flex items-center">
          <Link href={OVERVIEW_HREF} scroll={false} className={CRUMB}>
            Overview
          </Link>
        </li>
        {crumbs}
        <li className="flex min-w-0 items-center gap-1">
          <Separator />
          <span
            aria-current="page"
            className="inline-flex min-h-11 max-w-40 items-center truncate px-2 text-body font-semibold text-ink sm:max-w-56"
          >
            {current.name}
          </span>
        </li>
      </ol>
    </nav>
  );
}
