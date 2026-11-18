import type { AdminSystem as AdminSystemData } from "@/lib/admin/system";
import { CronRunList } from "./CronRunList";
import { RateLimitList } from "./RateLimitList";
import { ServiceList } from "./ServiceList";

/** The System page: services, the daily cleanup's runs, then every rate limit. */
export function AdminSystem({ system, shownRuns }: { system: AdminSystemData; shownRuns: number }) {
  return (
    <div className="flex flex-col gap-6" data-testid="admin-system">
      <ServiceList services={system.services} />
      <CronRunList runs={system.runs} shown={shownRuns} />
      <RateLimitList limits={system.rateLimits} />
    </div>
  );
}
