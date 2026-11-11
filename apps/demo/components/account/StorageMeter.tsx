"use client";

import { useId } from "react";
import {
  formatBytes,
  storageLevel,
  usedPercent,
  type StorageLevel,
} from "@/lib/account/storage-level";
import { Squiggy } from "../brand/mascot/Squiggy";
import { GrowBar } from "../overview/bento/GrowBar";
import { SettingsCard } from "./SettingsCard";
import { fileCount, STORAGE_COPY } from "./storage-copy";

const COPY = STORAGE_COPY.usage;

/**
 * The bar's fill: the brand's blue, warm as space runs low, red once it's gone.
 * brand-text, as PdfPicker's bar: cobalt is 2.1:1 on the dark track (WCAG 1.4.11), its
 * dark variant 6.7:1; in light they're the same cobalt.
 */
const FILL: Record<StorageLevel, string> = {
  ok: "bg-brand-text",
  near: "bg-comments",
  over: "bg-danger",
};

/** The warning under the bar. Text colors meet AA on their tints in both themes. */
const ALERT: Record<Exclude<StorageLevel, "ok">, { tint: string; text: string }> = {
  near: { tint: "bg-comments-soft", text: "text-comments-text" },
  over: { tint: "bg-danger-soft", text: "text-danger" },
};

interface StorageMeterProps {
  usedBytes: number;
  quotaBytes: number;
  files: number;
}

/**
 * Used of quota, as words and a bar. From 80% on, a warning with Squiggy
 * thinking it over; past the quota, uploads stop and it says so.
 */
export function StorageMeter({ usedBytes, quotaBytes, files }: StorageMeterProps) {
  const level = storageLevel(usedBytes, quotaBytes);
  const share = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 1;
  const percent = usedPercent(usedBytes, quotaBytes);
  const usedId = useId();
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="database"
      testId="storage-usage"
    >
      <div className="flex flex-col gap-3" data-level={level} data-testid="storage-meter">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p id={usedId} className="text-body text-muted">
            <span className="text-title font-bold text-ink tabular-nums">
              {formatBytes(usedBytes)}
            </span>{" "}
            {COPY.used(formatBytes(quotaBytes))}
          </p>
          <p className="text-meta text-muted tabular-nums">
            <span className="font-semibold text-ink">{percent}%</span>
            {" · "}
            {fileCount(files)}
          </p>
        </div>
        {/*
          The bar as a meter for assistive tech (GrowBar itself is aria-hidden), named by the
          line above. Its value stops at 100; the text says past it ("110%").
        */}
        <div
          role="meter"
          aria-labelledby={usedId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, percent)}
          aria-valuetext={`${percent}%`}
        >
          <GrowBar share={share} fill={FILL[level]} height="h-3" />
        </div>
      </div>
      {level === "ok" ? null : <QuotaAlert level={level} />}
    </SettingsCard>
  );
}

/**
 * Running low, or out of space: what that means and what to do, beside a thinking Squiggy.
 * As FormAlert: out of space blocks uploads, so it's an alert (announced as the page opens
 * in the app); running low is a status. The role sits on the words only, so Squiggy's name
 * isn't read with them. A heading, so it's found by heading navigation on a fresh load.
 */
function QuotaAlert({ level }: { level: Exclude<StorageLevel, "ok"> }) {
  const { tint, text } = ALERT[level];
  const copy = COPY[level];
  return (
    <div
      className={`flex flex-col items-start gap-3 rounded-tile p-4 sm:flex-row sm:items-center sm:gap-4 ${tint}`}
      data-testid="storage-alert"
      data-level={level}
    >
      <Squiggy mood="thinking" size={72} still className="shrink-0" />
      <div role={level === "over" ? "alert" : "status"} className="flex min-w-0 flex-col gap-1">
        <h3 className={`text-heading font-semibold ${text}`}>{copy.title}</h3>
        <p className="text-body text-pretty text-ink-2">{copy.body}</p>
      </div>
    </div>
  );
}
