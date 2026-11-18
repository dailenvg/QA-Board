import type { Metadata } from "next";
import { AdminSystem } from "@/components/admin/AdminSystem";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { loadAdminSystemPage } from "@/lib/admin/admin-pages";
import { CRON_RUNS_SHOWN } from "@/lib/admin/system";

export const metadata: Metadata = { title: "System" };

/**
 * Which services this deployment has configured (never their values), the
 * daily cleanup's latest runs, and every rate limit with where it's kept.
 */
export default async function AdminSystemPage() {
  const page = await loadAdminSystemPage();
  if (page.kind === "unavailable") return <AdminUnavailable title="System" />;
  return <AdminSystem system={page.system} shownRuns={CRON_RUNS_SHOWN} />;
}
