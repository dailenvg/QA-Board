import Link from "next/link";
import { SquintMark } from "./SquintMark";

interface LogoProps {
  /** Secondary line under the wordmark, as in the sidebar header. */
  caption?: string;
  /** False on a shared review link, where there is no home to go to. */
  linked?: boolean;
}

function Mark({ caption, home }: { caption: string | undefined; home: boolean }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-card shadow-seg">
        <SquintMark className="size-7" />
      </span>
      {/* Named by its visible text (WCAG 2.5.3); the hidden suffix says where it goes. */}
      <span className="flex min-w-0 flex-col">
        <span className="text-heading font-bold tracking-tight">Squint</span>
        {caption ? <span className="text-meta text-muted">{caption}</span> : null}
        {home ? <span className="sr-only"> (home)</span> : null}
      </span>
    </>
  );
}

/** Squint mark and wordmark, linking home unless `linked` is false. */
export function Logo({ caption, linked = true }: LogoProps) {
  if (!linked) {
    return (
      <span className="inline-flex min-h-11 items-center gap-3 pr-2">
        <Mark caption={caption} home={false} />
      </span>
    );
  }
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-3 rounded-row pr-2 hover:opacity-85 active:opacity-70"
    >
      <Mark caption={caption} home />
    </Link>
  );
}
