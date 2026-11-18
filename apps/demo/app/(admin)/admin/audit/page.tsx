import type { Metadata } from "next";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { AuditLog } from "@/components/admin/AuditLog";
import { loadAuditLogPage } from "@/lib/admin/admin-pages";
import type { SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Audit log" };

/**
 * Who changed what across Squint, newest first: filtered by workspace, who
 * did it and action, a page at a time, all in the URL.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const page = await loadAuditLogPage(await searchParams);
  if (page.kind === "unavailable") return <AdminUnavailable title="Audit log" />;
  const { workspace, actor, action, before, after } = page.params;
  return (
    <AuditLog
      filters={{ workspace, actor, action }}
      paged={Boolean(before ?? after)}
      page={page.page}
      options={page.options}
    />
  );
}
