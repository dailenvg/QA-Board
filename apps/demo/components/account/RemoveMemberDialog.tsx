"use client";

import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.remove;

interface RemoveMemberDialogProps {
  open: boolean;
  /** Who: their name as the row shows it. */
  name: string;
  workspaceName: string;
  pending: boolean;
  /** Why the last try didn't work; Confirm tries again unless `refused`. */
  error: string | null;
  /** Refused for good (403): Confirm stays off, Cancel closes. */
  refused: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirms removing someone (4b.5): what happens to them and their work, and
 * that it can't be undone, though an invite within 24 hours brings their
 * account back. Cancel is focused first, so Enter never removes. Stays up
 * while it's sent; a failure shows in it.
 */
export function RemoveMemberDialog({
  open,
  name,
  workspaceName,
  pending,
  error,
  refused,
  onConfirm,
  onClose,
}: RemoveMemberDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title={COPY.title(name, workspaceName)}
      description={
        <ul className="flex list-disc flex-col gap-2 pl-5" data-testid="remove-member-points">
          {COPY.points(workspaceName).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      }
      confirmLabel={COPY.confirm(name)}
      pending={pending}
      pendingLabel={COPY.pending}
      error={error}
      confirmDisabled={refused}
      onConfirm={onConfirm}
      onClose={() => {
        if (!pending) onClose();
      }}
    />
  );
}
