import { useSyncExternalStore } from "react";
import { can, type Permission } from "../auth/permissions";
import type { SignedInWorkspace } from "../workspace/types";
import { useWorkspaceIdentity } from "./workspace-identity";
import { getWorkspaceAccess, subscribeWorkspace } from "./workspace-store";

/**
 * The workspace and what the signed-in member may do there (`role`,
 * `permissions`, the owner's name), as fresh as the rest of the workspace: a
 * switch the owner changes shows on the next read (focus, or a refusal).
 * The server render's until this tab connects; null outside a workspace
 * (a review link), even in a tab that was in one before.
 */
export function useWorkspaceAccess(): SignedInWorkspace | null {
  const initial = useWorkspaceIdentity();
  return useSyncExternalStore(
    subscribeWorkspace,
    () => (initial ? (getWorkspaceAccess() ?? initial) : null),
    () => initial,
  );
}

/**
 * Whether the member may do it (`can`), so a control the server would refuse
 * is hidden. False outside a workspace, where there's nobody to allow.
 */
export function useCan(permission: Permission): boolean {
  const access = useWorkspaceAccess();
  return access !== null && can(access, permission);
}
