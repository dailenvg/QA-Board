import { monogram } from "@/lib/monogram";

interface MonogramTileProps {
  name: string;
  /** A brand color to sit on; null uses the neutral navy. */
  color: string | null;
  /** Its size, shape and type size: it fills whatever frame it's given. */
  className?: string;
  testId?: string;
}

/**
 * A name's initials on its color, standing in for a logo or avatar that
 * isn't there. Decorative: the name itself is always beside it.
 */
export function MonogramTile({ name, color, className = "", testId }: MonogramTileProps) {
  const { initials, background, ink } = monogram(name, color);
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      style={{ backgroundColor: background, color: ink }}
      className={`grid place-items-center leading-none font-bold tracking-tight select-none ${className}`}
    >
      {initials}
    </span>
  );
}
