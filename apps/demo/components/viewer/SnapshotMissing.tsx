"use client";

import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/** A snapshot whose image is no longer in this browser's storage. */
export function SnapshotMissing({ onRetake }: { onRetake: (() => void) | null }) {
  return (
    <div
      role="alert"
      data-testid="snapshot-missing"
      className="grid min-h-80 place-items-center rounded-tile bg-card p-6 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-3">
        <h2 className="text-title font-bold">This snapshot isn&apos;t in this browser anymore</h2>
        <p className="text-body text-muted">
          Its picture was removed from this browser&apos;s storage. The comments are still here.
        </p>
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
