import { useEffect, useId, useState } from "react";
import { Icon } from "./Icon";

/** Marks the help tooltip so Escape handling elsewhere can defer to it while it is open. */
export const HELP_OPEN_ATTRIBUTE = "data-pp-help";

interface HelpButtonProps {
  branch: string | null;
}

/**
 * "?" button with an explanatory tooltip on hover, focus, or tap. A click or tap
 * toggles it, and a dismissal sticks until focus leaves, so a second tap on touch
 * (where the button keeps focus) actually closes it.
 */
export function HelpButton({ branch }: HelpButtonProps) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = pinned || ((hovered || focused) && !dismissed);

  const dismiss = () => {
    setPinned(false);
    setDismissed(true);
  };

  // Escape closes the tooltip wherever focus is (it can be open on hover alone).
  // The overlay's own Escape handler stands aside while this is open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPinned(false);
      setDismissed(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="pp-btn pp-btn--icon"
        aria-label="How pinpoint works"
        aria-describedby={id}
        onClick={() => {
          if (open) {
            dismiss();
          } else {
            setDismissed(false);
            setPinned(true);
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
          setDismissed(false);
        }}
      >
        <Icon name="help" />
      </button>
      {/* Always mounted so aria-describedby resolves on first focus; hidden when closed. */}
      <div
        id={id}
        className="pp-bubble pp-help"
        role="tooltip"
        hidden={!open}
        {...{ [HELP_OPEN_ATTRIBUTE]: "" }}
      >
        <p>
          <strong>pinpoint</strong> collects feedback on this preview
          {branch ? ` (${branch})` : ""}.
        </p>
        <ol>
          <li>Press Comment.</li>
          <li>Click any element, or choose one with Tab or arrow keys and press Enter.</li>
          <li>Write your comment and post it. It lands in the pull request.</li>
        </ol>
      </div>
    </>
  );
}
