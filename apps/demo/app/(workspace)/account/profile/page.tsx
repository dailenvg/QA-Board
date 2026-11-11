import type { Metadata } from "next";
import { ProfileSettings } from "@/components/account/ProfileSettings";
import { sessionAvatarVersion, sessionDeletion } from "@/lib/account/session-settings";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

export const metadata: Metadata = { title: "Profile" };

/**
 * Name, photo, sign-in email, password and sessions, for whoever is signed
 * in, and deleting the account for anyone but the admin.
 */
export default async function ProfilePage() {
  const { user } = await loadSessionWorkspace();
  return (
    <ProfileSettings
      name={user.name}
      email={user.email}
      avatarVersion={await sessionAvatarVersion(user.id)}
      deletion={await sessionDeletion(user)}
    />
  );
}
