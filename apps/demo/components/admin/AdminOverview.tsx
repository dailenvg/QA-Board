import type { AdminOverview as AdminOverviewData } from "@/lib/admin/overview";
import { ActivityCard } from "./ActivityCard";
import { AdminStats } from "./AdminStats";

/** The admin panel's first page: the headline counts, then the last 30 days of activity. */
export function AdminOverview({ overview }: { overview: AdminOverviewData }) {
  return (
    <div className="flex flex-col gap-6" data-testid="admin-overview">
      <AdminStats counts={overview.counts} />
      <ActivityCard activity={overview.activity} />
    </div>
  );
}
