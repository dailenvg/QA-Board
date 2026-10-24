import Link from "next/link";
import { SquintMark } from "./SquintMark";

interface LogoProps {
  /** Secondary line under the wordmark, as in the sidebar header. */
  caption?: string;
}

/** Squint mark and wordmark, linking home. */
export function Logo({ caption }: LogoProps) {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-3 rounded-row pr-2 hover:opacity-85 active:opacity-70"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-card shadow-seg">
        <SquintMark className="size-7" />
      </span>
      {/* Named by its visible text (WCAG 2.5.3); the hidden suffix says where it goes. */}
      <span className="flex min-w-0 flex-col">
        <span className="text-heading font-bold tracking-tight">Squint</span>
        {caption ? <span className="text-meta text-muted">{caption}</span> : null}
        <span className="sr-only"> (home)</span>
      </span>
    </Link>
  );
}
