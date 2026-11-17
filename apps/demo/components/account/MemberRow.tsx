"use client";

import { motion, useReducedMotion } from "motion/react";
import type { MemberSwitch } from "@/lib/auth/permissions";
import { instant, spring, useRevealVariants } from "@/lib/motion";
import { useCompanyBadge } from "@/lib/workspace-client/use-company-badge";
import type { AskContext } from "@/lib/workspace-client/permission-copy";
import { Menu } from "../ui/Menu";
import { PersonAvatar } from "../ui/PersonAvatar";
import { MemberPermissions } from "./MemberPermissions";
import { MEMBERS_COPY } from "./members-copy";
import { OwnPermissions } from "./OwnPermissions";
import type { PersonRow } from "./people-rows";
import { useDeleteDate } from "./use-delete-date";

const COPY = MEMBERS_COPY.people;

/** `LargeProjectRow`'s geometry, but not a link: only the row's own controls react. */
const ROW = "flex min-h-11 items-center gap-3 rounded-row px-3 py-2";

/**
 * Past the row's padding and the avatar (12 + 40px), so the Permissions trigger's own 12px
 * padding puts its words under the name. Phones drop the indent for the panel's width.
 */
const INDENT = "pl-13 pr-3 max-sm:pl-3";

const CHIP =
  "shrink-0 rounded-pill bg-brand-soft px-2 py-0.5 text-label font-semibold text-brand-text";

interface MemberRowProps {
  person: PersonRow;
  /** The session member's own switches, for their own row (D5); null for the owner. */
  ownPermissions: readonly MemberSwitch[] | null;
  context: AskContext;
  owner: string;
  permissionsOpen: boolean;
  onPermissionsOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onLeft: (message: string) => void;
}

/**
 * A person in the People list: avatar with the company badge, name with "You" and "Owner" chips,
 * then the email (where the view has it) and when they joined. The owner's
 * view adds a member's Permissions under it, and a row the viewer may remove
 * gets a menu with Remove. Their own row shows a member what they can do.
 */
export function MemberRow({
  person,
  ownPermissions,
  context,
  owner,
  permissionsOpen,
  onPermissionsOpenChange,
  onRemove,
  onLeft,
}: MemberRowProps) {
  const reduce = useReducedMotion();
  const variants = useRevealVariants();
  const badge = useCompanyBadge();
  return (
    <motion.li
      layout="position"
      variants={variants}
      exit="exit"
      transition={reduce ? instant : spring.snappy}
      className="flex flex-col gap-1"
      data-testid="member-row"
      data-row-key={person.key}
      data-you={person.you || undefined}
    >
      <div className={ROW}>
        <PersonAvatar
          src={person.avatarSrc}
          size="md"
          badge={badge}
          photoTestId="member-avatar"
          initialsTestId="member-initials"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="min-w-0 truncate text-nav font-semibold text-ink"
              title={person.name}
              data-testid="member-name"
            >
              {person.name}
            </span>
            {person.you ? <span className={CHIP}>{COPY.you}</span> : null}
            {person.isOwner ? <span className={CHIP}>{COPY.owner}</span> : null}
          </div>
          <JoinedLine email={person.email} joinedAt={person.joinedAt} />
        </div>
        {person.removable && person.id ? (
          <Menu
            label={COPY.actions(person.name)}
            icon="moreVertical"
            items={[{ label: COPY.remove, icon: "trash", danger: true, onSelect: onRemove }]}
            testId="member-menu"
            className="shrink-0"
          />
        ) : null}
      </div>
      {person.permissions && person.id ? (
        <div className={INDENT}>
          <MemberPermissions
            userId={person.id}
            name={person.name}
            initial={person.permissions}
            context={context}
            open={permissionsOpen}
            onOpenChange={onPermissionsOpenChange}
            onLeft={onLeft}
          />
        </div>
      ) : null}
      {person.you && ownPermissions ? (
        <div className={INDENT}>
          <OwnPermissions permissions={ownPermissions} owner={owner} />
        </div>
      ) : null}
    </motion.li>
  );
}

/** "ana@x.com · Joined Nov 3, 2026", or just when they joined in a member's view. */
function JoinedLine({ email, joinedAt }: { email: string | null; joinedAt: number }) {
  const date = useDeleteDate(joinedAt);
  return (
    <span className="text-meta text-muted wrap-anywhere" data-testid="member-meta">
      {email ? `${email} · ` : null}
      <time dateTime={new Date(joinedAt).toISOString()}>{COPY.joined(date)}</time>
    </span>
  );
}
