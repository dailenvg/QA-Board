import type { Metadata } from "next";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { AdminWorkspaces } from "@/components/admin/AdminWorkspaces";
import { loadAdminWorkspacesPage } from "@/lib/admin/admin-pages";

export const metadata: Metadata = { title: "Workspaces" };

/**
 * Every workspace, with its owner, size, activity and state, and what the
 * admin can do to each: edit its quota, reset its owner's password, suspend
 * or archive it. The archived ones are listed apart, each with Unarchive.
 */
export default async function AdminWorkspacesPage() {
  const page = await loadAdminWorkspacesPage();
  if (page.kind === "unavailable") return <AdminUnavailable title="Workspaces" />;
  return <AdminWorkspaces workspaces={page.workspaces} />;
}
