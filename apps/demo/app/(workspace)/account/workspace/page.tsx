import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsUnavailable } from "@/components/account/SettingsUnavailable";
import { WorkspaceSettings } from "@/components/account/WorkspaceSettings";
import { loadWorkspaceSettingsPage } from "@/lib/account/session-settings";

export const metadata: Metadata = { title: "Workspace" };

/** Name, logo, brand color, sender name and integrations of the signed-in user's workspace. None for the admin. */
export default async function WorkspaceSettingsPage() {
  const page = await loadWorkspaceSettingsPage();
  if (page.kind === "none") notFound();
  if (page.kind === "unavailable") return <SettingsUnavailable title="Workspace" />;
  return (
    <WorkspaceSettings settings={page.settings} isOwner={page.isOwner} clickUp={page.clickUp} />
  );
}
