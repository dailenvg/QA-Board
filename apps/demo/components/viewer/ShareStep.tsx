import { useId, type ReactNode } from "react";

interface ShareStepProps {
  /** The step's number in the lime badge; phones' tabs leave it out. */
  step: number | null;
  title: string;
  /** Beside the title, on the right (a status). */
  aside?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/**
 * One numbered step of the Share window: a lime badge edged in the line art's
 * ink, its title, and its controls on a tile.
 */
export function ShareStep({ step, title, aside, children, testId }: ShareStepProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-card bg-tile p-4 sm:p-5"
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 id={titleId} className="flex items-center gap-2 text-heading font-bold">
          {step === null ? null : (
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-pill bg-highlight text-label font-extrabold text-on-highlight ring-1 ring-scene-ink ring-inset"
            >
              {step}
            </span>
          )}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
