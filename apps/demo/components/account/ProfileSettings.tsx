import { EmailForm } from "./EmailForm";
import { LogOutEverywhere } from "./LogOutEverywhere";
import { NameForm } from "./NameForm";
import { PasswordForm } from "./PasswordForm";

interface ProfileSettingsProps {
  name: string | null;
  email: string;
}

/**
 * The profile section: name, sign-in email, password, and signing out
 * everywhere. Each card reveals itself as it scrolls into view.
 */
export function ProfileSettings({ name, email }: ProfileSettingsProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="profile-settings">
      <NameForm initialName={name} />
      <EmailForm currentEmail={email} />
      <PasswordForm email={email} />
      <LogOutEverywhere />
    </div>
  );
}
