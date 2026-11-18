import type { WorkspaceStatus } from "@/lib/admin/workspaces";
import { Icon, type IconName } from "../ui/Icon";
import { BADGE_SHELL } from "../ui/StatusChip";
import { ADMIN_COPY } from "./admin-copy";

/** Each status's tint and ink, which meet AA together in both themes, and its icon. */
const LOOK: Record<WorkspaceStatus, { tone: string; icon: IconName }> = {
  active: { tone: "bg-ready-soft text-ready-text", icon: "check" },
  suspended: { tone: "bg-warning-soft text-warning-text", icon: "pause" },
  deleting: { tone: "bg-danger-soft text-danger", icon: "clock" },
};

/** Where a workspace stands, as a badge: active, suspended, or scheduled for deletion. */
export function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  const { tone, icon } = LOOK[status];
  return (
    <span
      data-testid="workspace-status"
      data-status={status}
      className={`${BADGE_SHELL} max-w-full shrink-0 font-semibold ${tone}`}
    >
      <Icon name={icon} className="size-4 shrink-0" />
      <span className="truncate">{ADMIN_COPY.workspaces.status[status]}</span>
    </span>
  );
}
