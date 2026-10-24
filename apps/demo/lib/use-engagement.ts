import { useState, type FocusEvent } from "react";

export interface EngagementHandlers {
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onFocus: () => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * True while a mouse or pen hovers the element or focus is anywhere inside it.
 * Spread the handlers on a `motion` element: its hover events ignore touch,
 * so a tap never leaves the element engaged.
 */
export function useEngagement(): [boolean, EngagementHandlers] {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return [
    hovered || focused,
    {
      onHoverStart: () => setHovered(true),
      onHoverEnd: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      },
    },
  ];
}
