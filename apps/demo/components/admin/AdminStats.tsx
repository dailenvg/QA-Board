"use client";

import { motion } from "motion/react";
import type { AdminCounts } from "@/lib/admin/overview";
import { formatBytes } from "@/lib/account/storage-level";
import { staggerGroup } from "@/lib/motion";
import { AnimatedNumber } from "../overview/bento/AnimatedNumber";
import type { IconName } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";
import { StatTile } from "./StatTile";

const COPY = ADMIN_COPY.overview;

const ICONS: Record<keyof AdminCounts, IconName> = {
  workspaces: "layers",
  users: "users",
  projects: "folder",
  comments: "message",
  activeShares: "link",
  storageBytes: "database",
};

const ORDER: ReadonlyArray<keyof AdminCounts> = [
  "workspaces",
  "users",
  "projects",
  "comments",
  "activeShares",
  "storageBytes",
];

const GROUP = staggerGroup();

/** The headline counts across every workspace, rising in one after another. */
export function AdminStats({ counts }: { counts: AdminCounts }) {
  return (
    <section aria-labelledby="admin-stats-title" className="flex flex-col gap-3">
      <h2 id="admin-stats-title" className="sr-only">
        {COPY.stats}
      </h2>
      <motion.ul
        variants={GROUP}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3"
        data-testid="admin-stats"
      >
        {ORDER.map((key) => (
          <StatTile
            key={key}
            label={COPY.counts[key].label}
            note={COPY.counts[key].note}
            icon={ICONS[key]}
            testId={`admin-stat-${key}`}
            value={
              key === "storageBytes" ? (
                formatBytes(counts[key])
              ) : (
                <AnimatedNumber value={counts[key]} />
              )
            }
          />
        ))}
      </motion.ul>
    </section>
  );
}
