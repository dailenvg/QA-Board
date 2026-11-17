import { monogram } from "@/lib/monogram";

interface MonogramTileProps {
  name: string;
  /** Its size, shape and type size: it fills whatever frame it's given. */
  className?: string;
  testId?: string;
}

/**
 * A name's initials on the neutral navy: a client's avatar on their comments,
 * plain beside the team's default marks. Decorative: the name itself is
 * always beside it.
 */
export function MonogramTile({ name, className = "", testId }: MonogramTileProps) {
  const { initials, background, ink } = monogram(name, null);
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      style={{ backgroundColor: background, color: ink }}
      className={`grid place-items-center leading-none font-bold tracking-tight select-none dark:ring-1 dark:ring-white/20 dark:ring-inset ${className}`}
    >
      {initials}
    </span>
  );
}
