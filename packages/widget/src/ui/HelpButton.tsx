import { useId, useState } from "react";
import { Icon } from "./Icon";

interface HelpButtonProps {
  branch: string | null;
}

/** "?" button with an explanatory tooltip on hover, focus, or tap. */
export function HelpButton({ branch }: HelpButtonProps) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;

  return (
    <>
      <button
        type="button"
        className="pp-btn pp-btn--icon"
        aria-label="How pinpoint works"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          event.stopPropagation();
          setHovered(false);
          setPinned(false);
          setFocused(false);
        }}
      >
        <Icon name="help" />
      </button>
      {open ? (
        <div id={id} className="pp-bubble" role="tooltip">
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
      ) : null}
    </>
  );
}
