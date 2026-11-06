import { Suspense, type ReactNode } from "react";
import { WelcomeSignal } from "@/components/auth/WelcomeSignal";
import { requireSession } from "@/lib/auth/guards";

/** The project viewer: signed-in users only (the session is checked here, not just its cookie). */
export default async function ViewerLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <>
      <Suspense fallback={null}>
        <WelcomeSignal />
      </Suspense>
      {children}
    </>
  );
}
