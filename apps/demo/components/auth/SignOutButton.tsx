"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { personMonogramName } from "@/lib/monogram";
import { fadeOnly } from "@/lib/motion";
import { MonogramTile } from "../brand/MonogramTile";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface SignOutButtonProps {
  /** Who is signed in, shown beside the button. */
  email: string;
  /** Their name, for the initials shown without a photo; null uses the email. */
  name: string | null;
  /** Their photo's URL, shown before the email; null without one. */
  avatarSrc?: string | null;
}

/**
 * Who is signed in (their photo, or their initials without one, and email), and Sign
 * out: a plain form post to the logout route, which answers with a redirect
 * to /login, so it works before hydration too.
 */
export function SignOutButton({ email, name, avatarSrc = null }: SignOutButtonProps) {
  const [pending, setPending] = useState(false);
  // A photo that won't load (removed in another tab) gives way to the initials, not a broken image.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

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
      <span className="flex min-w-0 items-center gap-2">
        {/* One fixed slot: photo and initials cross-fade in place, so the email never shifts. */}
        <span className="relative size-7 shrink-0">
          <AnimatePresence initial={false}>
            {avatarSrc && avatarSrc !== brokenSrc ? (
              <motion.span
                key={avatarSrc}
                variants={fadeOnly}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute inset-0"
              >
                <Image
                  src={avatarSrc}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  onError={() => setBrokenSrc(avatarSrc)}
                  data-testid="account-avatar"
                  className="size-full rounded-pill object-cover"
                />
              </motion.span>
            ) : (
              <motion.span
                key="initials"
                variants={fadeOnly}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute inset-0"
              >
                <MonogramTile
                  name={personMonogramName(name, email)}
                  color={null}
                  className="size-full rounded-pill text-label"
                  testId="account-initials"
                />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="min-w-0 truncate text-meta text-muted" title={email}>
          <span className="sr-only">Signed in as </span>
          {email}
        </span>
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
