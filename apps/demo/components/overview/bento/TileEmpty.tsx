import type { ReactNode } from "react";

interface TileEmptyProps {
  title: string;
  children: ReactNode;
  /** A small picture above the words, such as a resolved pin (`ResolvedPin`). */
  art?: ReactNode;
}

/** A tile with nothing to show yet: what's missing, and what will show up here. */
export function TileEmpty({ title, children, art }: TileEmptyProps) {
  return (
    <div data-testid="tile-empty" className="flex flex-1 flex-col justify-center gap-1 py-2">
      {art ? <span className="mb-2 block">{art}</span> : null}
      <p className="text-heading font-semibold">{title}</p>
      <p className="text-body text-muted">{children}</p>
    </div>
  );
}
