import { AvatarForm } from "./AvatarForm";
import { EmailForm } from "./EmailForm";
import { LogOutEverywhere } from "./LogOutEverywhere";
import { NameForm } from "./NameForm";
import { PasswordForm } from "./PasswordForm";

interface ProfileSettingsProps {
  name: string | null;
  email: string;
  /** The avatar's `?v=`, or null without one. */
  avatarVersion: string | null;
}

/**
 * The profile section: name, photo, sign-in email, password, and signing out
 * everywhere. Each card reveals itself as it scrolls into view.
 */
export function ProfileSettings({ name, email, avatarVersion }: ProfileSettingsProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="profile-settings">
      <NameForm initialName={name} />
      <AvatarForm name={name} email={email} initialVersion={avatarVersion} />
      <EmailForm currentEmail={email} />
      <PasswordForm email={email} />
      <LogOutEverywhere />
    </div>
  );
}
