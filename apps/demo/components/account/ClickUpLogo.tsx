import { useId } from "react";

/** The mark's two shapes (Simple Icons' ClickUp path, split): the smile under the arrow. */
const SMILE_PATH =
  "M2 18.439l3.69-2.828c1.961 2.56 4.044 3.739 6.363 3.739 2.307 0 4.33-1.166 6.203-3.704L22 18.405C19.298 22.065 15.941 24 12.053 24 8.178 24 4.788 22.078 2 18.439z";
const ARROW_PATH = "M12.04 6.15l-6.568 5.66-3.036-3.52L12.055 0l9.543 8.296-3.05 3.509z";

/**
 * ClickUp's mark in its own gradients (purple to blue under, pink to yellow
 * above), naming the integration beside its heading. Decorative: the heading
 * says "ClickUp". Reads on light and dark panels alike.
 */
export function ClickUpLogo({ className = "size-6" }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id={`${id}-smile`}
          x1="2"
          y1="20"
          x2="22"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8930FD" />
          <stop offset="1" stopColor="#49CCF9" />
        </linearGradient>
        <linearGradient
          id={`${id}-arrow`}
          x1="2.4"
          y1="6"
          x2="21.6"
          y2="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FF02F0" />
          <stop offset="1" stopColor="#FFC800" />
        </linearGradient>
      </defs>
      <path d={SMILE_PATH} fill={`url(#${id}-smile)`} />
      <path d={ARROW_PATH} fill={`url(#${id}-arrow)`} />
    </svg>
  );
}
