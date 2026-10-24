import type { ReactNode } from "react";
import { PageTransition } from "@/components/app-state/PageTransition";

/** Page transition between top-level routes (workspace, viewer, sandbox and so on). */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
