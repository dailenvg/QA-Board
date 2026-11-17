import { STATUS_LABEL, type ProjectStatus } from "@/lib/store/status";
import { Icon, type IconName } from "./Icon";

/** Solid status color, for dots. */
export const STATUS_DOT: Record<ProjectStatus, string> = {
  ready: "bg-ready",
  comments: "bg-comments",
  resolved: "bg-resolved",
};

/** One icon per status, shared by the chip and the folder sheets' markers. */
export const STATUS_ICON: Record<ProjectStatus, IconName> = {
  ready: "eye",
  comments: "message",
  resolved: "check",
};

/** The solid status fill and the dark ink that sits on it. The ink meets AA in both themes. */
export const STATUS_FILL: Record<ProjectStatus, string> = {
  ready: "bg-ready text-on-highlight",
  comments: "bg-comments text-on-highlight",
  resolved: "bg-resolved-pin text-on-resolved-pin",
};

const EDGE: Record<ProjectStatus, string> = {
  ready: "ring-on-highlight/30",
  comments: "ring-on-highlight/30",
  resolved: "ring-resolved-pin-line/30",
};

/**
 * The pin shape every badge shares: 24px tall, with the comment pin's square corner. No weight:
 * states are semibold, a label (the person's own words) medium.
 */
export const BADGE_SHELL =
  "inline-flex h-6 items-center gap-1 rounded-pin pl-2 pr-3 text-label whitespace-nowrap";

/** The quiet badge, for what isn't a status: a card surface with a hairline edge. */
export const NEUTRAL_BADGE = "bg-card text-ink-2 ring-1 ring-line-strong ring-inset";

interface StatusChipProps {
  status: ProjectStatus;
  className?: string;
}

/** A project's status as a solid pin: the status color, its icon, and the label in dark ink. */
export function StatusChip({ status, className = "" }: StatusChipProps) {
  return (
    <span
      data-testid="status-chip"
      data-status={status}
      className={`${BADGE_SHELL} shrink-0 font-semibold shadow-seg ring-1 ${STATUS_FILL[status]} ${EDGE[status]} ${className}`}
    >
      <Icon name={STATUS_ICON[status]} className="size-4 shrink-0" />
      {STATUS_LABEL[status]}
    </span>
  );
}
