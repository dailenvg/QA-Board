"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface SignOutButtonProps {
  /** Who is signed in, shown beside the button. */
  email: string;
}

/**
 * Who is signed in, and Sign out: a plain form post to the logout route, which
 * answers with a redirect to /login, so it works before hydration too.
 */
export function SignOutButton({ email }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);

  // Back from /login, the browser may restore this page from its cache with the button still
  // "Signing out…" and inert. Reset it so it works again.
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  const submit = (event: FormEvent) => {
    if (pending) event.preventDefault();
    else setPending(true);
  };
  return (
    <form
      action="/api/auth/logout"
      method="post"
      onSubmit={submit}
      className="flex min-w-0 items-center justify-between gap-3 rounded-card bg-card py-2 pr-2 pl-4"
    >
      <span className="min-w-0 truncate text-meta text-muted" title={email}>
        <span className="sr-only">Signed in as </span>
        {email}
      </span>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-disabled={pending || undefined}
        data-testid="sign-out"
        className="shrink-0"
      >
        <Icon name="logOut" className="size-4" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </form>
  );
}
