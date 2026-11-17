/** Phosphor's check and plus as center lines on its 256 grid, so a pin can stroke them heavier. */
const ICONS = {
  check: "M40 144l56 56L224 72",
  plus: "M40 128h176M128 40v176",
} as const;

/** 3.2px on a 24px icon, as the pins have always drawn it. */
const STROKE = (3.2 / 24) * 256;

interface PreviewIconProps {
  name: keyof typeof ICONS;
  color: string;
  size: number;
}

/** A bold stroked icon for a pin: the check on resolved pins, the plus on a new one. */
export function PreviewIcon({ name, color, size }: PreviewIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256">
      <path
        d={ICONS[name]}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
