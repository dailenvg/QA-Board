"use client";

import { useId } from "react";
import {
  formatBytes,
  storageLevel,
  usedPercent,
  type StorageLevel,
} from "@/lib/account/storage-level";
import { GrowBar } from "../overview/bento/GrowBar";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.workspaces;

/** The bar's fill, as the Storage page's meter colors it. */
const FILL: Record<StorageLevel, string> = {
  ok: "bg-brand-text",
  near: "bg-comments",
  over: "bg-danger",
};

interface WorkspaceStorageProps {
  usedBytes: number;
  quotaBytes: number;
}

/** Used of quota in words and a bar; past the quota (a quota set under it), said in words too. */
export function WorkspaceStorage({ usedBytes, quotaBytes }: WorkspaceStorageProps) {
  const level = storageLevel(usedBytes, quotaBytes);
  const percent = usedPercent(usedBytes, quotaBytes);
  const share = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 1;
  const labelId = useId();
  const over = usedBytes > quotaBytes;
  return (
    <div
      className="flex min-w-0 flex-col gap-1.5"
      data-testid="workspace-storage"
      data-level={level}
    >
      <p id={labelId} className="text-meta text-muted tabular-nums wrap-anywhere">
        <span className="font-semibold text-ink">{formatBytes(usedBytes)}</span>{" "}
        {COPY.ofQuota(formatBytes(quotaBytes))}
        {over ? (
          <span className="font-semibold text-danger" data-testid="workspace-over-quota">
            {" · "}
            {COPY.overQuota}
          </span>
        ) : null}
      </p>
      {/* GrowBar is aria-hidden; this names it with the line above. */}
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-valuetext={`${percent}%`}
      >
        <GrowBar share={share} fill={FILL[level]} height="h-1.5" />
      </div>
    </div>
  );
}
