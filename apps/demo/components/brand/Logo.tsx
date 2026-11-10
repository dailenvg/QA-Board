import Link from "next/link";
import { SquintMark } from "./SquintMark";

type LogoSize = "default" | "large";

/** The mark's tile and the wordmark, at each size: the large lockup leads the sidebar. */
const SIZES: Record<LogoSize, { tile: string; mark: string; word: string }> = {
  default: { tile: "size-10", mark: "size-7", word: "text-heading" },
  large: { tile: "size-12", mark: "size-8", word: "text-title" },
};

/**
 * The words' colors: the page's ink and muted text by default; on the highlighter (the
 * sidebar's brand panel, the same lime in both themes) its own ink, with the caption a
 * little lighter but still well past AA, and a focus ring in that ink, which reads on lime.
 */
type LogoTone = "default" | "on-highlight";

const TONES: Record<LogoTone, { word: string; caption: string; link: string }> = {
  default: { word: "", caption: "text-muted", link: "" },
  "on-highlight": {
    word: "text-on-highlight",
    caption: "text-on-highlight/75",
    link: "focus-visible:outline-on-highlight",
  },
};

interface LogoProps {
  /** Secondary line under the wordmark, as in the sidebar header. */
  caption?: string;
  size?: LogoSize;
  tone?: LogoTone;
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
  tone,
}: {
  caption: string | undefined;
  home: boolean;
  compact?: boolean;
  size: LogoSize;
  tone: LogoTone;
}) {
  const { tile, mark, word } = SIZES[size];
  const colors = TONES[tone];
  return (
    <>
      <span className={`grid ${tile} shrink-0 place-items-center rounded-pill bg-card shadow-seg`}>
        <SquintMark className={mark} />
      </span>
      {/* Named by its visible text (WCAG 2.5.3); the hidden suffix says where it goes. */}
      <span className={`flex min-w-0 flex-col ${compact ? "max-sm:sr-only" : ""}`}>
        <span className={`${word} font-bold tracking-tight ${colors.word}`}>Squint</span>
        {caption ? <span className={`text-meta ${colors.caption}`}>{caption}</span> : null}
        {home ? <span className="sr-only"> (home)</span> : null}
      </span>
    </>
  );
}

/** Squint mark and wordmark, linking home unless `linked` is false. */
export function Logo({
  caption,
  linked = true,
  compact = false,
  size = "default",
  tone = "default",
}: LogoProps) {
  if (!linked) {
    return (
      <span className="inline-flex min-h-11 items-center gap-3 pr-2">
        <Mark caption={caption} home={false} compact={compact} size={size} tone={tone} />
      </span>
    );
  }
  return (
    <Link
      href="/"
      className={`inline-flex min-h-11 items-center gap-3 rounded-row pr-2 hover:opacity-85 active:opacity-70 ${TONES[tone].link}`}
    >
      <Mark caption={caption} home size={size} tone={tone} />
    </Link>
  );
}
