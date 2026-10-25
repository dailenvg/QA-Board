"use client";

import { displayHost } from "@/lib/url";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { Skeleton } from "../ui/Skeleton";

/** After this long, the copy reassures that big pages simply take longer. */
const PATIENCE_MS = 8_000;

/** Placeholder page while the first snapshot of a site is taken. */
export function CaptureProgress({ url }: { url: string }) {
  const [fresh] = useTimedFlag(PATIENCE_MS, true);
  return (
    <div
      role="status"
      data-testid="capture-progress"
      className="mx-auto flex w-full max-w-5xl flex-col gap-3"
    >
      <p className="text-meta text-muted">
        <span className="font-semibold text-ink">Taking a snapshot of {displayHost(url)}…</span>{" "}
        {fresh
          ? "Comments pin to the snapshot, so they stay on the content while you scroll."
          : "Long pages take a little longer."}
      </p>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
