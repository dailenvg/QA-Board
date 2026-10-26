import type { Metadata, ResolvingMetadata } from "next";
import { redirect } from "next/navigation";
import { Overview } from "@/components/overview/Overview";
import { MAIN_PREVIEW, previewMetadata } from "@/lib/link-preview";
import { folderHref } from "@/lib/routes";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The home page is the one URL og:url is true for. Setting `openGraph` here
 * replaces the root layout's, so the card images its image files add are carried over.
 */
export async function generateMetadata(
  _props: { searchParams: Promise<SearchParams> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { openGraph } = await parent;
  return {
    title: "Overview",
    openGraph: { ...previewMetadata(MAIN_PREVIEW).openGraph, url: "/", images: openGraph?.images },
  };
}

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
