import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsUnavailable } from "@/components/account/SettingsUnavailable";
import { StorageSettings } from "@/components/account/StorageSettings";
import { loadStoragePage } from "@/lib/account/session-settings";

export const metadata: Metadata = { title: "Storage" };

/** How much the signed-in user's workspace stores, and what. Any member; none for the admin. */
export default async function StorageSettingsPage() {
  const page = await loadStoragePage();
  if (page.kind === "none") notFound();
  if (page.kind === "unavailable") return <SettingsUnavailable title="Storage" />;
  return <StorageSettings report={page.report} />;
}
