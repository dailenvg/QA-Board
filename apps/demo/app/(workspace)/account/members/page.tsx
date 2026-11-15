import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MembersSettings } from "@/components/account/MembersSettings";
import { SettingsUnavailable } from "@/components/account/SettingsUnavailable";
import { loadMembersPage } from "@/lib/account/session-settings";

export const metadata: Metadata = { title: "Members" };

/**
 * Who's in the signed-in user's workspace: everyone sees the people; the
 * owner, and a member with the people switch, can remove members; the owner
 * sets each member's switches. None for the admin.
 */
export default async function MembersSettingsPage() {
  const page = await loadMembersPage();
  if (page.kind === "none") notFound();
  if (page.kind === "unavailable") return <SettingsUnavailable title="Members" />;
  return <MembersSettings data={page.members} />;
}
