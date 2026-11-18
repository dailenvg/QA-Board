import type { Metadata } from "next";
import { AdminStorage } from "@/components/admin/AdminStorage";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { loadAdminStoragePage } from "@/lib/admin/admin-pages";

export const metadata: Metadata = { title: "Storage" };

/**
 * What Squint stores, and the workspaces and projects storing the most; the
 * orphan check (on demand) and Run sweep, the daily cleanup run now.
 */
export default async function AdminStoragePage() {
  const page = await loadAdminStoragePage();
  if (page.kind === "unavailable") return <AdminUnavailable title="Storage" />;
  return <AdminStorage storage={page.storage} />;
}
