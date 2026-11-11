import type { StorageReport } from "@/lib/account/schemas";
import { LargeProjects } from "./LargeProjects";
import { StorageBreakdown } from "./StorageBreakdown";
import { StorageMeter } from "./StorageMeter";

/**
 * The storage section, read-only for every member: used of quota, what's
 * using it, and the projects using the most. Each card reveals itself as it
 * scrolls into view.
 */
export function StorageSettings({ report }: { report: StorageReport }) {
  return (
    <div className="flex flex-col gap-4" data-testid="storage-settings">
      <StorageMeter
        usedBytes={report.usedBytes}
        quotaBytes={report.quotaBytes}
        files={report.files}
      />
      <StorageBreakdown buckets={report.buckets} />
      <LargeProjects projects={report.largeProjects} />
    </div>
  );
}
