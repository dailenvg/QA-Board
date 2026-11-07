"use client";

import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ImportActions } from "./ImportActions";
import { ImportStep } from "./ImportStep";

interface DiscardConfirmProps {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirms deleting this browser's local data. Cancel is focused first, as in `ConfirmDialog`. */
export function DiscardConfirm({ busy, onCancel, onConfirm }: DiscardConfirmProps) {
  return (
    <ImportStep testId="import-discard-confirm">
      <ImportActions>
        <Button
          variant="secondary"
          onClick={onCancel}
          aria-disabled={busy || undefined}
          data-autofocus
          data-testid="import-discard-cancel"
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={busy ? undefined : onConfirm}
          aria-disabled={busy || undefined}
          data-testid="import-discard-confirm-button"
        >
          <Icon name="trash" className="size-4" />
          {busy ? "Discarding…" : "Discard local data"}
        </Button>
      </ImportActions>
    </ImportStep>
  );
}
