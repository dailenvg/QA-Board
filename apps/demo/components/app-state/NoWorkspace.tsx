"use client";

import { motion } from "motion/react";
import { ACCOUNT_HREF } from "@/lib/routes";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { ProfileCard } from "../auth/ProfileCard";
import { Squiggy } from "../brand/mascot/Squiggy";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";

const GROUP = staggerGroup();

interface NoWorkspaceProps {
  /** Who is signed in. */
  email: string;
  /** Their name, for their initials; null uses the email. */
  name: string | null;
}

/**
 * Signed in, but not a member of any workspace (the admin, for now): an empty
 * state, not an error, with the way to the account settings and Sign out.
 */
export function NoWorkspace({ email, name }: NoWorkspaceProps) {
  const variants = useRevealVariants();
  return (
    <main id="main" className="grid min-h-dvh place-items-center p-4">
      <motion.section
        variants={GROUP}
        initial="hidden"
        animate="visible"
        data-testid="no-workspace"
        aria-labelledby="no-workspace-title"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-panel bg-panel px-6 py-12 text-center"
      >
        <motion.div variants={variants}>
          <Squiggy mood="sleeping" size={120} followCursor={false} />
        </motion.div>
        <motion.div variants={variants}>
          <h1 id="no-workspace-title" className="text-title font-bold">
            No workspace yet
          </h1>
          <p className="mt-2 text-body text-muted">
            This account isn&apos;t part of a workspace, so there are no folders or projects to
            show. Workspace accounts see theirs here.
          </p>
        </motion.div>
        <motion.div variants={variants} className="flex w-full flex-col gap-2">
          <ButtonLink href={ACCOUNT_HREF} variant="secondary" testId="account-settings-link">
            <Icon name="user" className="size-5" />
            Account settings
          </ButtonLink>
          <ProfileCard email={email} name={name} />
        </motion.div>
      </motion.section>
    </main>
  );
}
