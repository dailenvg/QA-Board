import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProfileCard } from "@/components/auth/ProfileCard";
import { WelcomeSignal } from "@/components/auth/WelcomeSignal";
import { sessionAvatarSrc } from "@/lib/account/session-settings";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The admin panel, for the Squint admin only: anyone else signed in gets a
 * 404, as if it didn't exist, and anyone signed out goes to /login. Each
 * page checks again (`lib/admin/admin-pages.ts`), never trusting this alone.
 * The first page after signing in carries the welcome flag, cleared here.
 */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <WelcomeSignal workspaceName={null} />
      </Suspense>
      <AdminLayout
        aside={
          <ProfileCard
            email={admin.email}
            name={admin.name}
            avatarSrc={await sessionAvatarSrc(admin.id)}
            admin
          />
        }
      >
        {children}
      </AdminLayout>
    </AdminShell>
  );
}
