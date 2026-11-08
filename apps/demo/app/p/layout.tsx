import { Suspense, type ReactNode } from "react";
import { NoWorkspace } from "@/components/app-state/NoWorkspace";
import { WorkspaceError } from "@/components/app-state/WorkspaceError";
import { WorkspaceProvider } from "@/components/app-state/WorkspaceProvider";
import { WelcomeSignal } from "@/components/auth/WelcomeSignal";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

/**
 * The project viewer: signed-in members only. The session and the membership are checked here,
 * and the workspace is read on the server.
 */
export default async function ViewerLayout({ children }: { children: ReactNode }) {
  const session = await loadSessionWorkspace();
  return (
    <>
      <Suspense fallback={null}>
        <WelcomeSignal />
      </Suspense>
      {session.kind === "ready" ? (
        <WorkspaceProvider start={session.start}>{children}</WorkspaceProvider>
      ) : session.kind === "none" ? (
        <NoWorkspace email={session.user.email} />
      ) : (
        <WorkspaceError reason="unavailable" />
      )}
    </>
  );
}
