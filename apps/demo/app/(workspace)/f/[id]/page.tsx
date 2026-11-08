import type { Metadata } from "next";
import { NoWorkspace } from "@/components/app-state/NoWorkspace";
import { FolderView } from "@/components/dashboard/FolderView";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

export const metadata: Metadata = { title: "Folder" };

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSessionWorkspace();
  if (session.kind === "none")
    return <NoWorkspace email={session.user.email} name={session.user.name} />;
  return <FolderView folderId={id} />;
}
