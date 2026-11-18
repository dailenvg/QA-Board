"use client";

import { useState } from "react";
import type { AdminWorkspace } from "@/lib/admin/workspaces";
import type { AdminActionError } from "@/lib/admin/workspaces-client";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ADMIN_COPY } from "./admin-copy";

/** The workspace actions that ask first. */
export type ConfirmKind = "suspend" | "archive";

interface WorkspaceConfirmDialogProps {
  open: boolean;
  kind: ConfirmKind;
  workspace: AdminWorkspace;
  /** Does it; resolves with why it didn't work, or null once it did (the caller closes). */
  onConfirm: () => Promise<AdminActionError | null>;
  onClose: () => void;
}

/**
 * Asks before suspending or archiving a workspace: what happens to its
 * people, its review links and its data. Cancel is focused first. Stays up
 * while it's sent; a failure shows in it, and confirming tries again.
 */
export function WorkspaceConfirmDialog({
  open,
  kind,
  workspace,
  onConfirm,
  onClose,
}: WorkspaceConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = ADMIN_COPY.workspaces[kind];

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const failure = await onConfirm();
    setPending(false);
    if (failure) setError(ADMIN_COPY.workspaces.errors[failure]);
  };

  return (
    <ConfirmDialog
      open={open}
      title={copy.title(workspace.name)}
      description={
        <ul className="flex list-disc flex-col gap-2 pl-5" data-testid={`${kind}-points`}>
          {copy.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      }
      confirmLabel={copy.confirm}
      pending={pending}
      pendingLabel={copy.pending}
      error={error}
      onConfirm={() => void confirm()}
      onClose={() => {
        if (!pending) onClose();
      }}
    />
  );
}
