import Link from "next/link";

/** Wordmark with the pin glyph used by the widget's badges. */
export function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-3 rounded-control pr-2 font-display text-h3"
      aria-label="pinpoint home"
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-pin bg-accent text-label font-sans font-bold text-on-accent"
      >
        p
      </span>
      pinpoint
    </Link>
  );
}
