import { Suspense, type ReactNode } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { WelcomeSignal } from "@/components/auth/WelcomeSignal";
import { Workspace } from "@/components/dashboard/Workspace";
import { requireSession } from "@/lib/auth/guards";

/**
 * Overview and folder pages share one persistent shell: sidebar, New project and folder dialogs.
 * Signed-in users only (the session is checked here, not just its cookie).
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireSession();
  return (
    <>
      <Suspense fallback={null}>
        <WelcomeSignal />
      </Suspense>
      <Workspace account={<SignOutButton email={user.email} />}>{children}</Workspace>
    </>
  );
}
