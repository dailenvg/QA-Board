"use client";

import { motion } from "motion/react";
import type { StorageReport } from "@/lib/account/schemas";
import { formatBytes } from "@/lib/account/storage-level";
import { revealViewport, staggerGroup, useRevealVariants } from "@/lib/motion";
import { GrowBar } from "../overview/bento/GrowBar";
import { SettingsCard } from "./SettingsCard";
import { fileCount, STORAGE_COPY } from "./storage-copy";

const COPY = STORAGE_COPY.breakdown;
const GROUP = staggerGroup();

type Bucket = StorageReport["buckets"][number];

/** Shown even when empty: what a workspace stores today. Videos come later; Other is rare. */
const ALWAYS: ReadonlySet<Bucket["bucket"]> = new Set(["images", "pdfs", "snapshots", "crops"]);

function shown(buckets: readonly Bucket[]): Bucket[] {
  return buckets.filter((bucket) => ALWAYS.has(bucket.bucket) || bucket.bytes > 0);
}

/** Usage by kind of file: each kind's size, files, and share of the total as a bar. */
export function StorageBreakdown({ buckets }: { buckets: readonly Bucket[] }) {
  const variants = useRevealVariants();
  const total = buckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="layoutGrid"
      testId="storage-breakdown"
    >
      {total === 0 ? (
        <p
          className="rounded-tile bg-tile p-4 text-body text-muted"
          data-testid="storage-breakdown-empty"
        >
          {COPY.empty}
        </p>
      ) : (
        <motion.ul
          variants={GROUP}
          initial="hidden"
          whileInView="visible"
          viewport={revealViewport}
          className="flex flex-col gap-4"
        >
          {shown(buckets).map((bucket) => (
            <motion.li
              key={bucket.bucket}
              variants={variants}
              className="flex flex-col gap-2"
              data-testid="storage-bucket"
              data-bucket={bucket.bucket}
            >
              <BucketRow bucket={bucket} total={total} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </SettingsCard>
  );
}

function BucketRow({ bucket, total }: { bucket: Bucket; total: number }) {
  const { label, hint } = STORAGE_COPY.buckets[bucket.bucket];
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-nav font-semibold">{label}</span>
          <span className="text-meta text-muted">{hint}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end tabular-nums">
          <span className="text-nav font-semibold">{formatBytes(bucket.bytes)}</span>
          <span className="text-meta text-muted">{fileCount(bucket.files)}</span>
        </div>
      </div>
      {/* brand-text, as the usage meter's: cobalt is 2.1:1 on the dark track, this 6.7:1. */}
      <GrowBar share={total > 0 ? bucket.bytes / total : 0} fill="bg-brand-text" />
    </>
  );
}
