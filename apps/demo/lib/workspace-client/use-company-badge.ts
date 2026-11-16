import { workspaceIconSrc } from "../routes";
import { useWorkspaceAccess } from "./use-workspace-access";

/**
 * The company badge on the team's avatars in the app (4b.15): the signed-in
 * workspace's icon, as fresh as the rest of the workspace, so a new logo,
 * color or name shows on the next read. Null outside a workspace (the admin,
 * a review link), where nobody gets one.
 */
export function useCompanyBadgeSrc(): string | null {
  const access = useWorkspaceAccess();
  return access && workspaceIconSrc(access.iconVersion);
}
