import type { ReactNode } from "react";
import { Icon, type IconName } from "../../ui/Icon";

interface TileHeadingProps {
  /** Names the tile (`aria-labelledby`). */
  id: string;
  icon: IconName;
  title: string;
  /** A few words under the title: what the tile counts, or since when. */
  subtitle?: ReactNode;
  /** The tile's key figure, as a `TileTag`, at the far end of the row. */
  tag?: ReactNode;
}

/**
 * A tile's heading, the same on every tile: its icon on a solid brand square,
 * the title with a short subtitle under it, and a tag on the right.
 */
export function TileHeading({ id, icon, title, subtitle, tag = null }: TileHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-field bg-brand text-on-brand shadow-seg"
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id={id} className="truncate text-heading font-bold">
          {title}
        </h2>
        {subtitle ? <p className="truncate text-meta text-muted">{subtitle}</p> : null}
      </div>
      {tag}
    </div>
  );
}
