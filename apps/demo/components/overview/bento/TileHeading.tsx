import type { ReactNode } from "react";

interface TileHeadingProps {
  /** Names the tile (`aria-labelledby`). */
  id: string;
  title: string;
  /** The tile's key figure, as a `TileTag`, at the far end of the row. */
  tag?: ReactNode;
}

/** A tile's heading, the same on every tile: its title, and a tag on the right. */
export function TileHeading({ id, title, tag = null }: TileHeadingProps) {
  return (
    <div className="flex min-h-6 items-center gap-3">
      <h2 id={id} className="min-w-0 flex-1 truncate text-heading font-bold">
        {title}
      </h2>
      {tag}
    </div>
  );
}
