import type { ReactNode } from "react";
import { PageTransition } from "@/components/app-state/PageTransition";

/** Page transition between Overview and folder pages, inside the persistent sidebar shell. */
export default function WorkspaceTemplate({ children }: { children: ReactNode }) {
  return <PageTransition className="flex flex-1 flex-col gap-4">{children}</PageTransition>;
}
