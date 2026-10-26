import type { CSSProperties } from "react";

interface StoryGlowProps {
  /** Any CSS color: a palette hex or a token such as `var(--color-brand)`. */
  color: string;
  /** Size, position and opacity; the glow is absolutely positioned. */
  className?: string;
}

/** A soft, blurred pool of color behind a scene or the mascot. Decorative and static. */
export function StoryGlow({ color, className = "" }: StoryGlowProps) {
  return (
    <span
      aria-hidden="true"
      style={{ "--glow": color } as CSSProperties}
      className={`pointer-events-none absolute block rounded-full bg-(--glow) blur-3xl ${className}`}
    />
  );
}
