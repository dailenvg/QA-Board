/** Marks a comment a client left on the project's review link, wherever the workspace lists it. */
export function ClientChip() {
  return (
    <span
      data-testid="client-chip"
      className="shrink-0 rounded-pill bg-brand-soft px-2 py-0.5 text-label font-semibold text-brand-text"
    >
      Client
    </span>
  );
}
