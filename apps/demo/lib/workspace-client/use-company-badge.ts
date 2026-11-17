import type { CompanyBadge } from "../avatar/company-badge";
import { workspaceIconSrc } from "../routes";
import { useWorkspaceAccess } from "./use-workspace-access";

/**
 * The company badge on the team's avatars in the app (4b.15): the signed-in
 * workspace's icon when it has a logo, else its default badge, as fresh as
 * the rest of the workspace, so a new logo shows on the next read. Null outside a workspace (the admin, a review
 * link), where nobody gets one.
 */
export function useCompanyBadge(): CompanyBadge | null {
  const access = useWorkspaceAccess();
  if (!access) return null;
  return { logoSrc: access.hasLogo ? workspaceIconSrc(access.iconVersion) : null };
}
