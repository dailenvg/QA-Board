import type { DeletionConfirm } from "@/lib/account/field-rules";
import { AvatarForm } from "./AvatarForm";
import { DeleteAccount } from "./DeleteAccount";
import { EmailForm } from "./EmailForm";
import { LogOutEverywhere } from "./LogOutEverywhere";
import { NameForm } from "./NameForm";
import { PasswordForm } from "./PasswordForm";

interface ProfileSettingsProps {
  name: string | null;
  email: string;
  /** The avatar's `?v=`, or null without one. */
  avatarVersion: string | null;
  /** What deleting the account asks to be typed; null hides it (the admin's account). */
  deletion: DeletionConfirm | null;
}

/**
 * The profile section: name, photo, sign-in email, password, signing out
 * everywhere, and deleting the account. Each card reveals itself as it
 * scrolls into view.
 */
export function ProfileSettings({ name, email, avatarVersion, deletion }: ProfileSettingsProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="profile-settings">
      <NameForm initialName={name} />
      <AvatarForm name={name} email={email} initialVersion={avatarVersion} />
      <EmailForm currentEmail={email} />
      <PasswordForm email={email} />
      <LogOutEverywhere />
      {deletion ? <DeleteAccount confirm={deletion} email={email} /> : null}
    </div>
  );
}
