import { useId, useState } from "react";
import { Icon } from "./Icon";

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
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          event.stopPropagation();
          dismiss();
        }}
      >
        <Icon name="help" />
      </button>
      {/* Always mounted so aria-describedby resolves on first focus; hidden when closed. */}
      <div id={id} className="pp-bubble" role="tooltip" hidden={!open}>
        <p>
          <strong>Pinpoint</strong> collects feedback on this preview
          {branch ? ` (${branch})` : ""}.
        </p>
        <ol>
          <li>Press Comment.</li>
          <li>Click any element, or choose one with Tab or arrow keys and press Enter.</li>
          <li>Write your note and post it. It lands on the pull request.</li>
        </ol>
      </div>
    </>
  );
}
