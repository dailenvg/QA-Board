import {
  BODY_PATH,
  BRAND,
  EYE_LEFT_PATH,
  EYE_RIGHT_PATH,
  MARK_VIEWBOX,
} from "@/components/brand/mascot/paths";
import { PREVIEW_COLORS } from "./preview-theme";

/** The Squint mark and wordmark side by side, as in the app's header. */
export function PreviewLockup({ size }: { size: number }) {
  return (
    // The gap snaps to the 4px grid (16px at the share card's 60px mark).
    <div style={{ display: "flex", alignItems: "center", gap: Math.round((size * 0.28) / 4) * 4 }}>
      <svg width={size} height={size} viewBox={MARK_VIEWBOX}>
        <path d={BODY_PATH} fill={BRAND.body} fillRule="evenodd" />
        <g fill={BRAND.eye}>
          <path d={EYE_LEFT_PATH} />
          <path d={EYE_RIGHT_PATH} />
        </g>
      </svg>
      <div
        style={{
          display: "flex",
          fontSize: size * 0.82,
          fontWeight: 800,
          letterSpacing: -size * 0.025,
          color: PREVIEW_COLORS.ink,
        }}
      >
        Squint
      </div>
    </div>
  );
}
