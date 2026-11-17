import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { loadAdminOverviewPage } from "@/lib/admin/admin-pages";

export const metadata: Metadata = { title: "Admin" };

/** The admin panel's Overview: counts across every workspace, and the last 30 days of activity. */
export default async function AdminOverviewPage() {
  const page = await loadAdminOverviewPage();
  if (page.kind === "unavailable") return <AdminUnavailable title="Overview" />;
  return <AdminOverview overview={page.overview} />;
}
