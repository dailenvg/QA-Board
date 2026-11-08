import type { IconName } from "@/components/ui/Icon";
import { ACCOUNT_PROFILE_HREF, ACCOUNT_WORKSPACE_HREF } from "../routes";

/**
 * The account settings' sections, in nav order. Storage joins later. The
 * workspace's need one, so an account without one (the admin) sees only
 * what's about the account itself.
 */
export interface AccountSection {
  href: string;
  label: string;
  icon: IconName;
  /** Shown only to an account that belongs to a workspace. */
  needsWorkspace: boolean;
}

export const ACCOUNT_SECTIONS: readonly AccountSection[] = [
  { href: ACCOUNT_PROFILE_HREF, label: "Profile", icon: "user", needsWorkspace: false },
  { href: ACCOUNT_WORKSPACE_HREF, label: "Workspace", icon: "layers", needsWorkspace: true },
];

/** The sections an account sees: all of them in a workspace, the account's own otherwise. */
export function sectionsFor(hasWorkspace: boolean): AccountSection[] {
  return ACCOUNT_SECTIONS.filter((section) => hasWorkspace || !section.needsWorkspace);
}
