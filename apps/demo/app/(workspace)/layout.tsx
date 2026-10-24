import type { ReactNode } from "react";
import { Workspace } from "@/components/dashboard/Workspace";

/** Overview and folder pages share one persistent shell: sidebar, New project and folder dialogs. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
