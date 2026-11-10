import type { ReactNode } from "react";

/** Status colors, as on the status chips (text meets AA on its soft fill in both themes). */
const TONES = {
  brand: "bg-brand-soft text-brand-text",
  comments: "bg-comments-soft text-comments-text",
  resolved: "bg-resolved-soft text-resolved-text",
  ready: "bg-ready-soft text-ready-text",
} as const;

export type TagTone = keyof typeof TONES;

interface TileTagProps {
  tone: TagTone;
  children: ReactNode;
  testId?: string;
}

/** A tile's key figure in a pill, at the end of its heading ("3 open"). */
export function TileTag({ tone, children, testId }: TileTagProps) {
  return (
    <span
      data-testid={testId}
      className={`shrink-0 rounded-pill px-3 py-1 text-label font-semibold whitespace-nowrap tabular-nums ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
