import type { ReactNode } from "react";
import { PAPER } from "@/lib/brand-palette";
import { PREVIEW_COLORS } from "./preview-theme";

interface PreviewPinProps {
  fill: string;
  /** Number or icon color. */
  ink: string;
  /** An edge line inside the halo, for a fill as light as the halo (resolved Mint); none by default. */
  line?: string;
  size: number;
  /** Absolute position inside the art area, in pixels. */
  left: number;
  top: number;
  children: ReactNode;
}

/**
 * The app's teardrop pin (see `rounded-pin` and `.pin-marker`): round with a
 * sharp bottom-left tip, a white halo and a soft drop shadow, scaled up. A
 * resolved pin's Forest line is drawn as a border: the card renderer lays out
 * borders reliably, and the box keeps its size.
 */
export function PreviewPin({ fill, ink, line, size, left, top, children }: PreviewPinProps) {
  const round = size / 2;
  const tip = size / 8;
  const halo = Math.round(size / 14);
  /** As the app's 1.5px on a 32px pin, a little bolder so it survives a small unfurl. */
  const edge = Math.round(size / 20);
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: fill,
        color: ink,
        ...(line ? { border: `${edge}px solid ${line}` } : {}),
        borderRadius: `${round}px ${round}px ${round}px ${tip}px`,
        boxShadow: `0 0 0 ${halo}px ${PAPER}, 0 ${size / 5}px ${size / 2.5}px -${size / 8}px ${PREVIEW_COLORS.pinShadow}`,
        fontSize: size * 0.46,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {children}
    </div>
  );
}
