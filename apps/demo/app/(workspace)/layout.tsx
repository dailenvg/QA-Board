import type { ReactNode } from "react";
import { Workspace } from "@/components/dashboard/Workspace";
import { requireSession } from "@/lib/auth/guards";

/**
 * Overview and folder pages share one persistent shell: sidebar, New project and folder dialogs.
 * Signed-in users only (the session is checked here, not just its cookie).
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <Workspace>{children}</Workspace>;
}
