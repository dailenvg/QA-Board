import type { ReactNode } from "react";
import { PAPER } from "@/lib/brand-palette";
import { PREVIEW_COLORS } from "./preview-theme";

interface PreviewPinProps {
  fill: string;
  /** Number or icon color. */
  ink: string;
  size: number;
  /** Absolute position inside the art area, in pixels. */
  left: number;
  top: number;
  children: ReactNode;
}

/**
 * The app's teardrop pin (see `rounded-pin` and `.pin-marker`): round with a
 * sharp bottom-left tip, a white halo and a soft drop shadow, scaled up.
 */
export function PreviewPin({ fill, ink, size, left, top, children }: PreviewPinProps) {
  const round = size / 2;
  const tip = size / 8;
  const halo = Math.round(size / 14);
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
