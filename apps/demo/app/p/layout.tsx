import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";

/** The project viewer: signed-in users only (the session is checked here, not just its cookie). */
export default async function ViewerLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return children;
}
