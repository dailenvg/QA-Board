import type { Metadata } from "next";
import { NoWorkspace } from "@/components/app-state/NoWorkspace";
import { FoldersView } from "@/components/overview/FoldersView";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

export const metadata: Metadata = { title: "Folders" };

/** Every top-level folder as a glass folder, in the order chosen above them. */
export default async function FoldersPage() {
  const session = await loadSessionWorkspace();
  if (session.kind === "none")
    return <NoWorkspace email={session.user.email} name={session.user.name} />;
  return <FoldersView />;
}
