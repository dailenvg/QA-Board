import { Suspense, type ReactNode } from "react";
import { WorkspaceError } from "@/components/app-state/WorkspaceError";
import { WorkspaceProvider } from "@/components/app-state/WorkspaceProvider";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { WelcomeSignal } from "@/components/auth/WelcomeSignal";
import { Workspace } from "@/components/dashboard/Workspace";
import { sessionAvatarSrc } from "@/lib/account/session-settings";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

/**
 * Overview, folder and account pages share one persistent shell: sidebar, New project and folder
 * dialogs. Signed-in members only: the session and the membership are checked here, and the
 * workspace is read on the server. For someone in no workspace (the admin) each page decides:
 * Overview and folders show an empty state, the account settings a slim shell of their own.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await loadSessionWorkspace();
  const account = (
    <SignOutButton email={session.user.email} avatarSrc={await sessionAvatarSrc(session.user.id)} />
  );
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
        children
      ) : (
        <WorkspaceError reason="unavailable" />
      )}
    </>
  );
}
