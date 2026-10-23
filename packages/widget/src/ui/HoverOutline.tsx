interface HoverOutlineProps {
  element: Element | null;
}

const LABEL_SPACE = 24;

/**
 * Outline drawn inside the shadow root over the targeted element. The page's
 * own elements are never restyled. Re-measured on every layout tick.
 */
export function HoverOutline({ element }: HoverOutlineProps) {
  const rect = element?.getBoundingClientRect();
  if (!element || !rect || (rect.width === 0 && rect.height === 0)) return null;

  return (
    <div
      className={rect.top < LABEL_SPACE ? "pp-outline pp-outline--below" : "pp-outline"}
      style={{
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        width: rect.width,
        height: rect.height,
      }}
      aria-hidden="true"
    >
      <span className="pp-outline__label">{element.localName}</span>
    </div>
  );
}
