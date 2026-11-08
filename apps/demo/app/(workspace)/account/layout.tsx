import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountLayout } from "@/components/account/AccountLayout";
import { AccountShell } from "@/components/account/AccountShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { sectionsFor } from "@/lib/account/sections";
import { sessionAvatarSrc } from "@/lib/account/session-settings";
import { loadSessionWorkspace } from "@/lib/workspace/session-workspace";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Account settings. In a workspace they sit in its sidebar shell (the parent
 * layout's); an account in none (the admin) gets a slim shell of its own, with
 * only the sections about the account itself.
 */
export default async function AccountSettingsLayout({ children }: { children: ReactNode }) {
  const session = await loadSessionWorkspace();
  if (session.kind !== "none") {
    return <AccountLayout sections={sectionsFor(true)}>{children}</AccountLayout>;
  }
  return (
    <AccountShell>
      <AccountLayout
        sections={sectionsFor(false)}
        aside={
          <SignOutButton
            email={session.user.email}
            avatarSrc={await sessionAvatarSrc(session.user.id)}
          />
        }
      >
        {children}
      </AccountLayout>
    </AccountShell>
  );
}
