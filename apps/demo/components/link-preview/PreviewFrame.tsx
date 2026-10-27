import type { ReactNode } from "react";
import { PREVIEW_COLORS } from "./preview-theme";

/** Width of the art column on the right of the panel. */
const PREVIEW_ART_WIDTH = 430;

interface PreviewFrameProps {
  /** The words, on the left. */
  children: ReactNode;
  /** Squiggy and pins, positioned inside a PREVIEW_ART_WIDTH column on the right. */
  art: ReactNode;
}

/**
 * The shared card layout: a cobalt-tinted canvas with a soft glow, a large
 * rounded paper panel, words on the left and the mascot on the right.
 */
export function PreviewFrame({ children, art }: PreviewFrameProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 32,
        background: PREVIEW_COLORS.canvas,
        backgroundImage: `radial-gradient(circle at 85% 20%, ${PREVIEW_COLORS.glow}, ${PREVIEW_COLORS.glowFade} 55%)`,
        fontFamily: "Figtree",
        color: PREVIEW_COLORS.ink,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          borderRadius: 56,
          background: PREVIEW_COLORS.panel,
          boxShadow: `0 32px 64px -36px ${PREVIEW_COLORS.shadow}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -120,
            top: -40,
            width: 720,
            height: 720,
            display: "flex",
            backgroundImage: `radial-gradient(circle, ${PREVIEW_COLORS.glow}, ${PREVIEW_COLORS.glowFade} 62%)`,
          }}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 0 0 80px",
          }}
        >
          {children}
        </div>
        <div style={{ width: PREVIEW_ART_WIDTH, display: "flex", position: "relative" }}>{art}</div>
      </div>
    </div>
  );
}
