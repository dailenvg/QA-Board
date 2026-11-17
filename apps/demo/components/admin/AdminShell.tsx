import type { ReactNode } from "react";
import { ADMIN_HREF } from "@/lib/routes";
import { Logo } from "../brand/Logo";
import { ThemeToggle } from "../ui/ThemeToggle";

/**
 * The admin panel's frame: the logo (home, which for the admin is the panel)
 * and appearance on top, the panel below. Wider than the account settings' slim shell: the audit log reads
 * best with room.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 p-4">
      <header
        data-testid="admin-shell"
        className="flex min-h-11 items-center justify-between gap-3 rounded-panel bg-panel p-4"
      >
        <Logo caption="Visual review" href={ADMIN_HREF} />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
