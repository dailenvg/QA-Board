"use client";

import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/**
 * A snapshot whose image can't be loaded: gone from this browser's storage
 * (owner) or from the share's server (client). The copy fits both.
 */
export function SnapshotMissing({ onRetake }: { onRetake: (() => void) | null }) {
  return (
    <div
      data-testid="snapshot-missing"
      className="grid min-h-80 place-items-center rounded-tile bg-card p-6 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-3">
        <div role="alert" className="flex flex-col gap-3">
          <h2 className="text-title font-bold">This snapshot can&apos;t be shown</h2>
          <p className="text-body text-muted">
            Its image couldn&apos;t be loaded. The comments placed on it are still listed.
          </p>
        </div>
        {onRetake ? (
          <Button onClick={onRetake}>
            <Icon name="camera" className="size-4" />
            Take a new snapshot
          </Button>
        ) : null}
      </div>
    </div>
  );
}
