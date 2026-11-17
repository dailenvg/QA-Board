import {
  drawDefaultAvatar,
  type AvatarFit,
  type AvatarKind,
  type AvatarShape,
} from "@/lib/avatar/default-avatar";

interface DefaultAvatarProps {
  kind: AvatarKind;
  /** The slot's side in CSS px, for the outline's weight and the detail drawn. */
  size: number;
  fit?: AvatarFit;
  testId?: string;
}

function Shape({ shape }: { shape: AvatarShape }) {
  return (
    <path
      d={shape.d}
      fill={shape.fill}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
      strokeLinejoin={shape.strokeLinejoin}
      strokeLinecap={shape.stroke ? "round" : undefined}
    />
  );
}

/**
 * The default avatar (`drawDefaultAvatar`), filling its slot. The light edge
 * is always drawn and only shown in dark, so the server's render and the
 * theme never disagree. Free marks overflow their box on purpose (the tail,
 * the edge): no crop, no ring. Decorative: a name is always beside it.
 */
export function DefaultAvatar({ kind, size, fit = "free", testId }: DefaultAvatarProps) {
  const drawing = drawDefaultAvatar({ kind, size, fit, edge: true });
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      data-mark={kind}
      className="block size-full overflow-visible select-none"
    >
      <g className="hidden dark:inline">
        {drawing.edge.map((shape, index) => (
          <Shape key={index} shape={shape} />
        ))}
      </g>
      {drawing.art.map((shape, index) => (
        <Shape key={index} shape={shape} />
      ))}
    </svg>
  );
}
