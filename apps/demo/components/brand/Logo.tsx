import Link from "next/link";
import { SquintMark } from "./SquintMark";

type LogoSize = "default" | "large";

/** The mark's tile and the wordmark, at each size: the large lockup leads the sidebar. */
const SIZES: Record<LogoSize, { tile: string; mark: string; word: string }> = {
  default: { tile: "size-10", mark: "size-7", word: "text-heading" },
  large: { tile: "size-12", mark: "size-8", word: "text-title" },
};

interface LogoProps {
  /** Secondary line under the wordmark, as in the sidebar header. */
  caption?: string;
  size?: LogoSize;
  /** False on a shared review link, where there is no home to go to. */
  linked?: boolean;
  /** Hides the wordmark and caption on phones (still read out), leaving the mark. */
  compact?: boolean;
}

function Mark({
  caption,
  home,
  compact = false,
  size,
}: {
  caption: string | undefined;
  home: boolean;
  compact?: boolean;
  size: LogoSize;
}) {
  const { tile, mark, word } = SIZES[size];
  return (
    <>
      <span className={`grid ${tile} shrink-0 place-items-center rounded-pill bg-card shadow-seg`}>
        <SquintMark className={mark} />
      </span>
      {/* Named by its visible text (WCAG 2.5.3); the hidden suffix says where it goes. */}
      <span className={`flex min-w-0 flex-col ${compact ? "max-sm:sr-only" : ""}`}>
        <span className={`${word} font-bold tracking-tight`}>Squint</span>
        {caption ? <span className="text-meta text-muted">{caption}</span> : null}
        {home ? <span className="sr-only"> (home)</span> : null}
      </span>
    </>
  );
}

/** Squint mark and wordmark, linking home unless `linked` is false. */
export function Logo({ caption, linked = true, compact = false, size = "default" }: LogoProps) {
  if (!linked) {
    return (
      <span className="inline-flex min-h-11 items-center gap-3 pr-2">
        <Mark caption={caption} home={false} compact={compact} size={size} />
      </span>
    );
  }
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-3 rounded-row pr-2 hover:opacity-85 active:opacity-70"
    >
      <Mark caption={caption} home size={size} />
    </Link>
  );
}
