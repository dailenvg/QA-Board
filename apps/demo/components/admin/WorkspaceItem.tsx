"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { utcDate } from "@/lib/admin/utc-format";
import { resetOwnerEmail, type AdminWorkspace } from "@/lib/admin/workspaces";
import { duration, instant, spring, useRevealVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Menu, type MenuItem } from "../ui/Menu";
import { ADMIN_COPY } from "./admin-copy";
import { PENDING_OPACITY, rowVariants } from "./admin-motion";
import type { PendingAction } from "./use-workspace-actions";
import { WORKSPACE_GRID } from "./workspace-grid";
import { WorkspaceStatusBadge } from "./WorkspaceStatusBadge";
import { WorkspaceStorage } from "./WorkspaceStorage";

const COPY = ADMIN_COPY.workspaces;
const COLUMNS = COPY.columns;

export interface WorkspaceHandlers {
  onQuota: () => void;
  onReset: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}

interface WorkspaceItemProps extends WorkspaceHandlers {
  workspace: AdminWorkspace;
  /** Its place in the list, for the entrance's stagger. */
  order: number;
  pending: PendingAction | undefined;
}

/**
 * One value with its name: visible above it on phones, where each workspace
 * is a card; read out only from md up, where the list's header row shows it.
 */
function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <p className="text-label text-muted md:sr-only">{label}</p>
      <div className="min-w-0 text-body text-ink">{children}</div>
    </div>
  );
}

function menuItems(workspace: AdminWorkspace, handlers: WorkspaceHandlers): MenuItem[] {
  const menu = COPY.menu;
  const suspended = workspace.suspendedAt !== null;
  const deleting = workspace.status === "deleting";
  const resettable = resetOwnerEmail(workspace) !== null;
  return [
    { label: menu.quota, icon: "database", onSelect: handlers.onQuota, testId: "workspace-quota" },
    {
      label: resettable ? menu.reset : menu.resetNoOwner,
      icon: "lock",
      onSelect: handlers.onReset,
      disabled: !resettable,
      testId: "workspace-reset",
    },
    suspended
      ? {
          label: menu.unsuspend,
          icon: "play",
          onSelect: handlers.onUnsuspend,
          testId: "workspace-unsuspend",
          separatorBefore: true,
        }
      : {
          label: menu.suspend,
          icon: "pause",
          onSelect: handlers.onSuspend,
          testId: "workspace-suspend",
          separatorBefore: true,
        },
    {
      label: deleting ? menu.archiveDeleting : menu.archive,
      icon: "archive",
      danger: true,
      onSelect: handlers.onArchive,
      disabled: deleting,
      testId: "workspace-archive",
    },
  ];
}

/** The workspace's actions: the menu for an open one; Unarchive, in plain sight, for an archived one. */
function Actions({ workspace, pending, ...handlers }: Omit<WorkspaceItemProps, "order">) {
  if (workspace.archivedAt !== null) {
    const busy = pending === "unarchive";
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={busy ? undefined : handlers.onUnarchive}
        aria-disabled={busy || undefined}
        aria-label={busy ? undefined : COPY.archived.unarchiveLabel(workspace.name)}
        data-testid="workspace-unarchive"
      >
        <Icon name="archiveRestore" className="size-5" />
        {busy ? COPY.archived.unarchiving : COPY.archived.unarchive}
      </Button>
    );
  }
  return (
    <Menu
      label={COPY.actions(workspace.name)}
      icon="moreVertical"
      items={menuItems(workspace, handlers)}
      disabledReason={pending ? COPY.menu.working : null}
      testId="workspace-menu"
    />
  );
}

/**
 * A workspace: on phones a card (name and actions, then each value named
 * above it), from md up a row of the list's columns. Rises in with the
 * list; dims while an action on it waits on the server; glides when the rows
 * around it change, and fades out when it moves to the other list.
 */
export function WorkspaceItem({ workspace, order, pending, ...handlers }: WorkspaceItemProps) {
  const reduce = useReducedMotion() ?? false;
  const fade = useRevealVariants();
  const archived = workspace.archivedAt !== null;
  return (
    <motion.li
      layout="position"
      custom={order}
      variants={reduce ? fade : rowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={reduce ? instant : spring.snappy}
      aria-busy={pending ? true : undefined}
      data-testid="workspace-row"
      data-workspace-id={workspace.id}
      data-status={workspace.status}
      className="py-4 first:pt-0 last:pb-0 md:py-3"
    >
      <motion.div
        animate={{ opacity: pending ? PENDING_OPACITY : 1 }}
        transition={{ duration: duration.micro }}
        className={`flex flex-col gap-3 ${WORKSPACE_GRID}`}
      >
        <div className="flex items-start gap-3 md:contents">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            {/*
              Wraps rather than truncates: a title tooltip never reaches touch or keyboard,
              and names are at most 80 characters.
            */}
            <h3
              className="max-w-full text-nav font-semibold text-ink wrap-break-word"
              data-testid="workspace-name"
            >
              {workspace.name}
            </h3>
            <p
              className="max-w-full text-meta text-muted wrap-anywhere"
              data-testid="workspace-owner"
            >
              <span className="sr-only">{COLUMNS.owner}: </span>
              {workspace.ownerEmail ?? COPY.noOwner}
            </p>
            <span className="sr-only">{COLUMNS.status}: </span>
            <WorkspaceStatusBadge status={workspace.status} />
          </div>
          <div className="shrink-0 md:order-last md:justify-self-end">
            <Actions workspace={workspace} pending={pending} {...handlers} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:contents">
          <Cell label={COLUMNS.members}>
            <span className="tabular-nums">{workspace.members}</span>
          </Cell>
          <Cell label={COLUMNS.projects}>
            <span className="tabular-nums">{workspace.projects}</span>
          </Cell>
          <Cell label={COLUMNS.storage} className="col-span-2">
            <WorkspaceStorage usedBytes={workspace.usedBytes} quotaBytes={workspace.quotaBytes} />
          </Cell>
          <Cell
            label={archived ? COPY.archived.title : COLUMNS.lastActivity}
            className="col-span-2"
          >
            <ActivityDate workspace={workspace} />
          </Cell>
        </div>
      </motion.div>
    </motion.li>
  );
}

/** When it was last active, or, archived, when it was archived. Dates in UTC. */
function ActivityDate({ workspace }: { workspace: AdminWorkspace }) {
  const at = workspace.archivedAt ?? workspace.lastActivityAt;
  if (at === null) return <span className="text-muted">{COPY.noActivity}</span>;
  return (
    <time
      dateTime={new Date(at).toISOString()}
      className="text-meta text-ink-2 tabular-nums"
      data-testid="workspace-activity"
    >
      {utcDate(at)}
    </time>
  );
}
