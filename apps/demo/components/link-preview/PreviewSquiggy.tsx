import {
  BODY_PATH,
  BRAND,
  CENTER_X,
  EYE_LEFT_PATH,
  EYE_RIGHT_PATH,
  GROUND_Y,
} from "@/components/brand/mascot/paths";

type PreviewPose = "idle" | "welcome";

interface PoseSpec {
  /** Lean in degrees, pivoting where the mark meets the ground. */
  tilt: number;
  /** Where the eyes look, in SVG units. */
  gaze: { x: number; y: number };
  eyeScale: number;
}

/**
 * Still poses, after MOOD_SPECS: idle, and a welcome that leans toward the
 * words and looks at them with lifted, slightly wider eyes (as when listening).
 */
const POSES: Record<PreviewPose, PoseSpec> = {
  idle: { tilt: 0, gaze: { x: 0, y: 0 }, eyeScale: 1 },
  welcome: { tilt: -5, gaze: { x: -16, y: -6 }, eyeScale: 1.08 },
};

/** Each eye's center: the app scales eyes about their own middle. */
const EYE_CENTER_Y = 514;
const EYES = [
  { d: EYE_LEFT_PATH, cx: 215 },
  { d: EYE_RIGHT_PATH, cx: 362 },
] as const;

/** The mark plus its ground shadow, centered. */
const VIEWBOX = "67 290 440 440";

interface PreviewSquiggyProps {
  pose: PreviewPose;
  size: number;
}

/** Squiggy as a still SVG for ImageResponse, from the same vector paths as the app. */
export function PreviewSquiggy({ pose, size }: PreviewSquiggyProps) {
  const { tilt, gaze, eyeScale } = POSES[pose];
  return (
    <svg width={size} height={size} viewBox={VIEWBOX}>
      <ellipse cx={CENTER_X} cy={GROUND_Y + 16} rx={150} ry={13} fill={BRAND.ink} opacity={0.12} />
      <g transform={`rotate(${tilt} ${CENTER_X} ${GROUND_Y})`}>
        <path d={BODY_PATH} fill={BRAND.body} fillRule="evenodd" />
        <g fill={BRAND.eye} transform={`translate(${gaze.x} ${gaze.y})`}>
          {EYES.map(({ d, cx }) => (
            <path
              key={cx}
              d={d}
              transform={`translate(${cx} ${EYE_CENTER_Y}) scale(${eyeScale}) translate(${-cx} ${-EYE_CENTER_Y})`}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
