"use client";

import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.audit;

interface AuditPagerProps {
  /** The newer page's link, or null on the newest. */
  newerHref: string | null;
  /** The older page's link, or null on the oldest. */
  olderHref: string | null;
  /** Opens `href` (in a transition, so the list shows it's loading). */
  onNavigate: (href: string) => void;
}

/** Newer and Older, as links (each page is linkable); nothing when there's only one page. */
export function AuditPager({ newerHref, olderHref, onNavigate }: AuditPagerProps) {
  if (!newerHref && !olderHref) return null;
  const handOff = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <nav aria-label={COPY.pages} className="flex flex-wrap justify-between gap-3">
      {newerHref ? (
        <ButtonLink
          href={newerHref}
          variant="secondary"
          onNavigate={handOff(newerHref)}
          testId="audit-newer"
          className="max-sm:flex-1"
        >
          <Icon name="chevronLeft" className="size-5" />
          {COPY.newer}
        </ButtonLink>
      ) : (
        <span aria-hidden="true" />
      )}
      {olderHref ? (
        <ButtonLink
          href={olderHref}
          variant="secondary"
          onNavigate={handOff(olderHref)}
          testId="audit-older"
          className="max-sm:flex-1"
        >
          {COPY.older}
          <Icon name="chevronRight" className="size-5" />
        </ButtonLink>
      ) : null}
    </nav>
  );
}
