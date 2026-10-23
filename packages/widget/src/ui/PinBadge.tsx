import type { MouseEvent } from "react";
import type { Point } from "../core/geometry";
import { pinTransform } from "./pin-geometry";

interface PinBadgeProps {
  number: number;
  position: Point;
  label: string;
  detached?: boolean;
  resolved?: boolean;
  expanded?: boolean;
  /** Omit for the non-interactive pending pin shown while composing. */
  onOpen?: (trigger: HTMLElement) => void;
}

function classes(detached: boolean, resolved: boolean, pending: boolean): string {
  return [
    "pp-pin",
    detached ? "pp-pin--detached" : "",
    resolved ? "pp-pin--resolved" : "",
    pending ? "pp-pin--pending" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Numbered pin. Its 44px hit area wraps a 28px badge whose tip marks the anchor. */
export function PinBadge({
  number,
  position,
  label,
  detached = false,
  resolved = false,
  expanded = false,
  onOpen,
}: PinBadgeProps) {
  const style = { transform: pinTransform(position) };
  const badge = <span className="pp-pin__badge">{number}</span>;

  if (!onOpen) {
    return (
      <div className={classes(detached, resolved, true)} style={style} aria-hidden="true">
        {badge}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={classes(detached, resolved, false)}
      style={style}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={(event: MouseEvent<HTMLButtonElement>) => onOpen(event.currentTarget)}
    >
      {badge}
    </button>
  );
}
