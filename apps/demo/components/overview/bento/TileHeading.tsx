import type { ReactNode } from "react";
import { Icon, type IconName } from "../../ui/Icon";

/** Each tile's color, from the status tokens (text meets AA on its soft fill in both themes). */
const TONES = {
  brand: "bg-brand-soft text-brand-text",
  comments: "bg-comments-soft text-comments-text",
  resolved: "bg-resolved-soft text-resolved-text",
  ready: "bg-ready-soft text-ready-text",
} as const;

export type TileTone = keyof typeof TONES;

interface TileHeadingProps {
  /** Names the tile (`aria-labelledby`). */
  id: string;
  icon: IconName;
  tone: TileTone;
  children: ReactNode;
  /** At the far end of the row, such as a Pause button. */
  aside?: ReactNode;
}

/** A tile's heading: its icon on a soft tint, then its name. */
export function TileHeading({ id, icon, tone, children, aside = null }: TileHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`grid size-9 shrink-0 place-items-center rounded-pill ${TONES[tone]}`}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <h2 id={id} className="min-w-0 flex-1 text-heading font-bold">
        {children}
      </h2>
      {aside}
    </div>
  );
}
