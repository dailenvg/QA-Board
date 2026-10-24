import { STATUS_LABEL, type ProjectStatus } from "@/lib/store/status";

/** Solid status color, for dots. */
export const STATUS_DOT: Record<ProjectStatus, string> = {
  ready: "bg-ready",
  comments: "bg-comments",
  resolved: "bg-resolved",
};

const CHIP: Record<ProjectStatus, string> = {
  ready: "bg-ready-soft text-ready-text",
  comments: "bg-comments-soft text-comments-text",
  resolved: "bg-resolved-soft text-resolved-text",
};

interface StatusChipProps {
  status: ProjectStatus;
  className?: string;
}

/** Soft-tinted status pill with a solid dot. Text colors meet AA in both themes. */
export function StatusChip({ status, className = "" }: StatusChipProps) {
  return (
    <span
      data-testid="status-chip"
      data-status={status}
      className={`inline-flex shrink-0 items-center gap-2 rounded-pill px-3 py-1 text-label font-semibold whitespace-nowrap ${CHIP[status]} ${className}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-pill ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
