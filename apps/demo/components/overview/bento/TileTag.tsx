import type { ReactNode } from "react";
import { HIGHLIGHT_TAG } from "../../ui/highlight-tag";

interface TileTagProps {
  children: ReactNode;
}

/** A tile's key figure in Squint's lime tag, at the end of its heading ("3 open"). */
export function TileTag({ children }: TileTagProps) {
  return (
    <span data-testid="tile-tag" className={`${HIGHLIGHT_TAG} tabular-nums`}>
      {children}
    </span>
  );
}
