import type { ReactNode } from "react";
import { PageTransition } from "@/components/app-state/PageTransition";

/** Page transition between the admin panel's sections, inside its persistent nav. */
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return <PageTransition className="flex flex-1 flex-col">{children}</PageTransition>;
}
