"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { personMonogramName } from "@/lib/monogram";
import { fadeOnly } from "@/lib/motion";
import { ACCOUNT_HREF, isAccountPath } from "@/lib/routes";
import { applyTheme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { MonogramTile } from "../brand/MonogramTile";
import { Menu, type MenuItem } from "../ui/Menu";

interface ProfileCardProps {
  /** Who is signed in. */
  email: string;
  /** Their name, shown over the email and used for their initials; null uses the email. */
  name: string | null;
  /** Their photo's URL; null without one. */
  avatarSrc?: string | null;
  /** No card behind it: for the sidebar's foot, where a separator sets it apart instead. */
  bare?: boolean;
}

/** Tinted while an account page is open, so the way back there shows where you are. */
const CURRENT_TRIGGER_CLASS =
  "grid size-11 place-items-center rounded-pill bg-brand-soft text-brand-text transition-colors hover:bg-hover active:bg-seg aria-expanded:bg-hover";

/**
 * Shows who is signed in (photo or initials, name and email), with a menu for account
 * settings, dark mode and Sign out. Sign out is a plain form post to the logout route, which
 * redirects to /login.
 */
export function ProfileCard({ email, name, avatarSrc = null, bare = false }: ProfileCardProps) {
  const [pending, setPending] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const theme = useTheme();
  const onAccount = isAccountPath(usePathname());

  // Back from /login, the browser may restore this page from its cache with Sign out still
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

  const items: MenuItem[] = [
    { label: "Account", icon: "user", href: ACCOUNT_HREF, current: onAccount },
    {
      label: "Dark mode",
      icon: "moon",
      kind: "checkbox",
      checked: theme === "dark",
      onSelect: () => applyTheme(theme === "dark" ? "light" : "dark"),
    },
    {
      id: "sign-out",
      label: pending ? "Signing out…" : "Sign out",
      icon: "logOut",
      danger: true,
      separatorBefore: true,
      // Open while it works, so the pending label shows until /login replaces the page.
      keepOpen: true,
      busy: pending,
      testId: "sign-out",
      onSelect: () => form.current?.requestSubmit(),
    },
  ];

  return (
    <div
      className={`flex min-w-0 items-center gap-3 text-left ${bare ? "py-1 pl-2" : "rounded-card bg-card py-2 pr-2 pl-4"}`}
    >
      <ProfileAvatar email={email} name={name} avatarSrc={avatarSrc} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">Signed in as </span>
        {name ? (
          <span className="truncate text-body font-medium" title={name}>
            {name}
          </span>
        ) : null}
        {/* Without a name, the email is the first line: it takes the name's weight. */}
        <span
          className={`truncate ${name ? "text-meta text-muted" : "text-body font-medium"}`}
          title={email}
        >
          {email}
        </span>
      </span>
      <Menu
        label="Account menu"
        icon="moreVertical"
        items={items}
        placement="above"
        testId="account-menu"
        triggerClassName={onAccount ? CURRENT_TRIGGER_CLASS : undefined}
        className="shrink-0"
      />
      <form ref={form} action="/api/auth/logout" method="post" onSubmit={submit} hidden />
    </div>
  );
}

/** One fixed slot: photo and initials cross-fade in place, so the text never shifts. */
function ProfileAvatar({ email, name, avatarSrc }: Required<Omit<ProfileCardProps, "bare">>) {
  // A photo that won't load (removed in another tab) gives way to the initials, not a broken image.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  return (
    <span className="relative size-9 shrink-0">
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
              width={36}
              height={36}
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
  );
}
