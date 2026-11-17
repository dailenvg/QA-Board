import {
  drawDefaultAvatar,
  type AvatarFit,
  type AvatarKind,
  type AvatarShape,
} from "@/lib/avatar/default-avatar";

interface DefaultAvatarProps {
  kind: AvatarKind;
  /** The bubble's color: `personFill`, `companyFill` or a kind's own. */
  fill: string;
  /** The slot's side in CSS px, for the outline's weight and the detail drawn. */
  size: number;
  fit?: AvatarFit;
  /** A person's initials, under the head. */
  initials?: string;
  /** A person as head and shoulders, without initials (`drawDefaultAvatar`). */
  silhouette?: boolean;
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
export function DefaultAvatar({
  kind,
  fill,
  size,
  fit = "free",
  initials,
  silhouette,
  testId,
}: DefaultAvatarProps) {
  const drawing = drawDefaultAvatar({ kind, fill, size, fit, edge: true, initials, silhouette });
  const text = drawing.initials;
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
      {text ? (
        // The page's Figtree, inherited: no font-family here.
        <text
          x={text.x}
          y={text.y}
          fontSize={text.fontSize}
          fontWeight={text.fontWeight}
          letterSpacing={text.letterSpacing}
          fill={text.fill}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {text.text}
        </text>
      ) : null}
    </svg>
  );
}
