import type { Metadata, ResolvingMetadata } from "next";
import { ProjectSignIn } from "@/components/auth/ProjectSignIn";
import { Viewer } from "@/components/viewer/Viewer";
import { getSession } from "@/lib/auth/guards";
import { loginHref } from "@/lib/auth/next-path";
import { projectLinkMetadata } from "@/lib/project-link-metadata";
import { projectHref } from "@/lib/routes";
import { projectIconPath } from "@/lib/share/brand";
import { openProjectPreview } from "@/lib/workspace/project-preview";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * Signed out, a live project's link previews as its company's card (see
 * `projectLinkMetadata`); signed in, or for an id that doesn't open, as
 * Squint's own.
 */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  const signedIn = (await getSession()) !== null;
  const preview = signedIn ? null : await openProjectPreview(id);
  const inherited = await parent;
  return projectLinkMetadata({
    projectId: id,
    preview,
    signedIn,
    inherited: {
      openGraph: inherited.openGraph?.images ?? [],
      twitter: inherited.twitter?.images ?? [],
    },
  });
}

/**
 * A project's viewer, for its workspace's members (the layout checks the
 * membership). Signed out, the link shows whose project it is and Sign in,
 * which returns here; nothing of the project itself.
 */
export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  if (await getSession()) return <Viewer projectId={id} />;
  const preview = await openProjectPreview(id);
  const brand = preview && {
    company: preview.company,
    project: preview.project,
    color: preview.color,
    logoSrc: preview.logoVersion
      ? projectIconPath(id, {
          name: preview.company,
          color: preview.color,
          logoVersion: preview.logoVersion,
        })
      : null,
  };
  return <ProjectSignIn brand={brand} signInHref={loginHref(projectHref(id))} />;
}
