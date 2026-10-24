import { BODY_PATH, BRAND, EYE_LEFT_PATH, EYE_RIGHT_PATH, MARK_VIEWBOX } from "./mascot/paths";

interface SquintMarkProps {
  className?: string;
}

/** Static Squint mark in its original colors (as in squint-mark.svg); size it with the class name. */
export function SquintMark({ className = "size-8" }: SquintMarkProps) {
  return (
    <svg className={className} viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false">
      <path d={BODY_PATH} fill={BRAND.body} fillRule="evenodd" />
      <g fill={BRAND.eye}>
        <path d={EYE_LEFT_PATH} />
        <path d={EYE_RIGHT_PATH} />
      </g>
    </svg>
  );
}
