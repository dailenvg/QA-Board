"use client";

import type { ReactNode } from "react";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

interface ImportActionsProps {
  /** The main actions, least important first: stacked on phones with the last on top. */
  children: ReactNode;
  /** A quieter action set apart at the start of the row (Discard). */
  aside?: ReactNode;
}

/**
 * The import dialog's button row, laid out like `ConfirmDialog`'s. Phones
 * stack everything full width, the main action on top. Wider, the aside sits
 * at the start of the row; when the row runs out of room the main actions
 * wrap above it instead of squeezing their labels onto two lines.
 */
export function ImportActions({ children, aside }: ImportActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap-reverse sm:items-center sm:justify-end">
      {aside ? (
        <div className="flex sm:mr-auto sm:shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{aside}</div>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:shrink-0 sm:flex-row">{children}</div>
    </div>
  );
}

/**
 * Discard, as the row's aside: quiet (no fill, so it never competes with
 * Import) but marked destructive by its colour and icon, like a menu's
 * danger item. The span carries the colour because the ghost variant's
 * `text-ink` wins over a `text-danger` class on the button itself.
 */
export function DiscardButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} data-testid="import-discard">
      <span className="inline-flex items-center gap-2 text-danger">
        <Icon name="trash" className="size-4" />
        Discard local data
      </span>
    </Button>
  );
}
