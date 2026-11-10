import { BODY_PATH, BRAND, EYE_LEFT_PATH, EYE_RIGHT_PATH, MARK_VIEWBOX } from "./mascot/paths";

interface SquintMarkProps {
  className?: string;
  /**
   * `inverse`: a white mark with brand-blue eyes, for a brand-blue circle (the sidebar's
   * lockup). Otherwise the original colors (as in squint-mark.svg).
   */
  inverse?: boolean;
}

/** Static Squint mark; size it with the class name. */
export function SquintMark({ className = "size-8", inverse = false }: SquintMarkProps) {
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false">
      <path
        d={BODY_PATH}
        fill={inverse ? "var(--color-on-brand)" : BRAND.body}
        fillRule="evenodd"
      />
      <g fill={inverse ? "var(--color-brand)" : BRAND.eye}>
        <path d={EYE_LEFT_PATH} />
        <path d={EYE_RIGHT_PATH} />
      </g>
    </svg>
  );
}
