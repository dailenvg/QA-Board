import type { ReactNode } from "react";
import { StateArt, type ArtScene } from "../../ui/line-art/StateArt";

interface TileEmptyProps {
  title: string;
  children: ReactNode;
  /** The line-art scene beside the words. */
  scene: ArtScene;
}

/**
 * A tile with nothing to show yet: a small line-art scene (`StateArt`, its Squiggy holding
 * still beside the tile's words), what's missing, and what will show up here.
 */
export function TileEmpty({ title, children, scene }: TileEmptyProps) {
  return (
    <div data-testid="tile-empty" className="flex flex-1 items-center gap-4 py-2">
      <StateArt scene={scene} size="sm" still />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-heading font-semibold">{title}</p>
        <p className="text-body text-muted">{children}</p>
      </div>
    </div>
  );
}
