import type { CSSProperties } from "react";
import { PREVIEW_COLORS } from "./preview-theme";

interface TextSegment {
  text: string;
  /** Draws the app's lime highlighter swash behind these words. */
  highlight?: boolean;
}

interface PreviewTextProps {
  segments: readonly TextSegment[];
  style: CSSProperties;
}

/** Plain segments break between words; a highlighted one stays on one line. */
function words(segments: readonly TextSegment[]): TextSegment[] {
  return segments.flatMap((segment) =>
    segment.highlight
      ? [segment]
      : segment.text
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => ({ text: word })),
  );
}

/**
 * Wrapping text with an optional highlighted phrase. ImageResponse lays out
 * flex boxes only, so each word is its own item and the row wraps between them.
 */
export function PreviewText({ segments, style }: PreviewTextProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.24em", ...style }}>
      {words(segments).map((segment, index) => (
        <span
          key={index}
          style={
            segment.highlight
              ? {
                  background: PREVIEW_COLORS.highlight,
                  color: PREVIEW_COLORS.ink,
                  borderRadius: "0.3em",
                  padding: "0 0.14em",
                  margin: "0 -0.06em",
                }
              : undefined
          }
        >
          {segment.text}
        </span>
      ))}
    </div>
  );
}
