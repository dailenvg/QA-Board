import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Overview } from "@/components/overview/Overview";
import { folderHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Overview" };

type SearchParams = Record<string, string | string[] | undefined>;

/** Old folder links (`/?folder=<id>`) moved to `/f/<id>`; any other query is kept. */
function legacyFolderRedirect({ folder, ...rest }: SearchParams): string | null {
  if (typeof folder !== "string" || !folder) return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    for (const entry of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, entry);
    }
  }
  const search = query.toString();
  return `${folderHref(folder)}${search ? `?${search}` : ""}`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const target = legacyFolderRedirect(await searchParams);
  if (target) redirect(target);
  return <Overview />;
}
