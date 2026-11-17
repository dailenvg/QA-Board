/** Marks a comment a client left on the project's review link, wherever the workspace lists it. */
export function ClientChip() {
  return (
    <span
      data-testid="client-chip"
      className="inline-flex h-6 shrink-0 items-center rounded-pin bg-brand px-3 text-label font-semibold whitespace-nowrap text-on-brand dark:ring-1 dark:ring-on-brand/20 dark:ring-inset"
    >
      Client
    </span>
  );
}
