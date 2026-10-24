interface KbdProps {
  children: string;
  className?: string;
}

/** Keyboard shortcut hint. Decorative: the shortcut is also described in the control's title. */
export function Kbd({ children, className = "" }: KbdProps) {
  return (
    <kbd
      aria-hidden="true"
      className={`rounded-kbd border border-line-strong px-2 py-px font-sans text-kbd font-semibold text-muted ${className}`}
    >
      {children}
    </kbd>
  );
}
