import { Suspense, type ReactNode } from "react";
import { NoWorkspace } from "@/components/app-state/NoWorkspace";
import { WorkspaceError } from "@/components/app-state/WorkspaceError";
import { WorkspaceProvider } from "@/components/app-state/WorkspaceProvider";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { WelcomeSignal } from "@/components/auth/WelcomeSignal";
import { Workspace } from "@/components/dashboard/Workspace";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

/**
 * Overview and folder pages share one persistent shell: sidebar, New project and folder dialogs.
 * Signed-in members only: the session and the membership are checked here, and the workspace is
 * read on the server. Someone in no workspace (the admin) gets an empty state instead.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await loadSessionWorkspace();
  const account = <SignOutButton email={session.user.email} />;
  return (
    <>
      <Suspense fallback={null}>
        <WelcomeSignal />
      </Suspense>
      {session.kind === "ready" ? (
        <WorkspaceProvider start={session.start}>
          <Workspace account={account}>{children}</Workspace>
        </WorkspaceProvider>
      ) : session.kind === "none" ? (
        <NoWorkspace account={account} />
      ) : (
        <WorkspaceError reason="unavailable" />
      )}
    </>
  );
}
