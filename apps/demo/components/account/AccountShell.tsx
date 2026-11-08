import type { ReactNode } from "react";
import { Logo } from "../brand/Logo";
import { ThemeToggle } from "../ui/ThemeToggle";

/**
 * The account settings' frame for an account in no workspace (the admin),
 * which has no sidebar: the logo (home) and appearance on top, the settings below.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 p-4">
      <header
        data-testid="account-shell"
        className="flex min-h-11 items-center justify-between gap-3 rounded-panel bg-panel p-4"
      >
        <Logo caption="Visual review" />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
