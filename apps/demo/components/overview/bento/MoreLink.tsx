import Link from "next/link";
import { Icon } from "../../ui/Icon";

interface MoreLinkProps {
  /** How many rows the tile has no room for. */
  count: number;
  href: string;
}

/** "+3 more in Folders", under a tile's list when not every row fits. */
export function MoreLink({ count, href }: MoreLinkProps) {
  return (
    <Link
      href={href}
      data-testid="tile-more"
      className="inline-flex min-h-11 shrink-0 items-center gap-1 self-start rounded-pill px-3 text-meta font-semibold text-brand-text transition-colors hover:bg-hover active:bg-seg focus-visible:-outline-offset-2"
    >
      +{count} more in Folders
      <Icon name="chevronRight" className="size-4" />
    </Link>
  );
}
