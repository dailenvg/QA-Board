/** Lucide paths, as the app's Icon uses them. */
const ICONS = {
  check: "M20 6 9 17l-5-5",
  plus: "M5 12h14M12 5v14",
} as const;

interface PreviewIconProps {
  name: keyof typeof ICONS;
  color: string;
  size: number;
}

/** A bold stroked icon for a pin: the check on resolved pins, the plus on a new one. */
export function PreviewIcon({ name, color, size }: PreviewIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d={ICONS[name]}
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
