import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/Icon";

interface ShareSettingRowProps {
  icon: IconName;
  /** Id for the title, so a control can be named by it. */
  titleId: string;
  title: string;
  /** What the setting does now; its id describes the control. */
  summary: ReactNode;
  summaryId: string;
  /** Beside the title, right: a status ("Saving…") or a switch. */
  aside?: ReactNode;
  /** Under the row: the setting's own controls. */
  children?: ReactNode;
  testId?: string;
}

/** One of the Share window's settings, as a row: its icon, name, what it does now, and its controls. */
export function ShareSettingRow({
  icon,
  titleId,
  title,
  summary,
  summaryId,
  aside,
  children,
  testId,
}: ShareSettingRowProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-tile bg-card p-3 ring-1 ring-line ring-inset"
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-row bg-panel text-ink-2"
        >
          <Icon name={icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-body font-semibold text-ink">
            {title}
          </p>
          {/* Pretty wrapping: no lone last word ("…can open / it") on a phone. */}
          <div id={summaryId} className="text-meta text-pretty text-muted">
            {summary}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}
