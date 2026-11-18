"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { formatBytes } from "@/lib/account/storage-level";
import type { AdminStorage as AdminStorageData } from "@/lib/admin/storage";
import { staggerGroup } from "@/lib/motion";
import { useDialogState } from "@/lib/use-dialog-state";
import { ADMIN_COPY } from "./admin-copy";
import { OrphanCheckCard } from "./OrphanCheckCard";
import { StatTile } from "./StatTile";
import { StorageProjectList } from "./StorageProjectList";
import { StorageWorkspaceList } from "./StorageWorkspaceList";
import { SweepDialog } from "./SweepDialog";
import { SweepTile } from "./SweepTile";
import { useOrphanCheck } from "./use-orphan-check";

const COPY = ADMIN_COPY.storage;
const GROUP = staggerGroup();

/**
 * The Storage page: what Squint stores and the daily cleanup, side by side;
 * the orphan check; then the workspaces and projects storing the most. Run
 * sweep asks first, in its dialog; once it's run, the page reads the server
 * again, and an earlier orphan check, out of date now, is set aside.
 */
export function AdminStorage({ storage }: { storage: AdminStorageData }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const orphans = useOrphanCheck();
  const sweep = useDialogState<number>();
  const openings = useRef(0);

  const openSweep = () => {
    openings.current += 1;
    sweep.show(openings.current);
  };

  const swept = () => {
    orphans.reset();
    startRefresh(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-6" data-testid="admin-storage">
      <section aria-labelledby="admin-storage-summary">
        <h2 id="admin-storage-summary" className="sr-only">
          {COPY.total.label}
        </h2>
        <motion.ul
          variants={GROUP}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 sm:gap-4"
        >
          <StatTile
            label={COPY.total.label}
            value={formatBytes(storage.totalBytes)}
            note={COPY.total.note(storage.totalFiles)}
            icon="database"
            testId="storage-total"
          />
          <SweepTile lastRun={storage.lastRun} onRun={openSweep} />
        </motion.ul>
      </section>
      <OrphanCheckCard state={orphans.state} onCheck={() => void orphans.check()} />
      <StorageWorkspaceList workspaces={storage.workspaces} />
      <StorageProjectList projects={storage.projects} />
      {sweep.payload !== null ? (
        <SweepDialog key={sweep.payload} open={sweep.open} onClose={sweep.close} onSwept={swept} />
      ) : null}
    </div>
  );
}
