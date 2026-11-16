"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { membersErrorMessage, removeMember } from "@/lib/account/members-client";
import { staggerGroup } from "@/lib/motion";
import { ownerLabel, type AskContext } from "@/lib/workspace-client/permission-copy";
import type { MembersData } from "@/lib/workspace/members/members-data";
import { seatsLeft } from "@/lib/workspace/members/seats";
import { useToast } from "../ui/ToastProvider";
import { InviteLinkDialog } from "./InviteLinkDialog";
import { LeavingMembers } from "./LeavingMembers";
import { MemberRow } from "./MemberRow";
import { MEMBERS_COPY } from "./members-copy";
import { PeopleEmpty } from "./PeopleEmpty";
import { inviteKey, PendingInvites } from "./PendingInvites";
import { rowsOf, type PersonRow } from "./people-rows";
import { RemoveMemberDialog } from "./RemoveMemberDialog";
import { SettingsCard } from "./SettingsCard";
import { useCopyInviteLink } from "./use-copy-invite-link";
import type { InviteActions } from "./use-invite-actions";

const COPY = MEMBERS_COPY.people;
const GROUP = staggerGroup();

/** Each row's menu trigger, people's and invites' alike: where focus goes once a row leaves. */
const ROW_MENU = '[data-testid="member-menu"], [data-testid="invite-menu"]';

/** The removal being confirmed, and how its request went. */
interface Removal {
  person: PersonRow;
  open: boolean;
  pending: boolean;
  error: string | null;
  refused: boolean;
}

/** A row that may leave with the refresh under way, and where focus goes if it does. */
interface Pending {
  key: string;
  target: HTMLElement | null;
}

/**
 * The People card (4b.2, 4b.3, 4b.14): everyone in the workspace, the owner
 * first. The owner sees each member's Permissions; the owner, and a member
 * with the people switch, can remove the members they may (D1), and see
 * pending invites (with their menus) and members who are leaving; a member
 * sees their own permissions under their row. Nothing is optimistic: a row
 * leaves once the server has acted, and focus goes to the next row's menu
 * (else the previous one's, else the list's heading). `actions` is null in a
 * member's view.
 */
export function PeopleCard({
  data,
  actions,
}: {
  data: MembersData;
  actions: InviteActions | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const groups = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const links = useCopyInviteLink();
  /** Focus's next place once a row has left: moved after the dialog has given focus back. */
  const focusNext = useRef<HTMLElement | null>(null);
  /** A row a refresh may take away (it changed elsewhere): focus moves on if it does. */
  const afterRefresh = useRef<Pending | null>(null);

  const context: AskContext = { ownerName: data.ownerName, workspaceName: data.workspaceName };
  const owner = ownerLabel(data.ownerName);
  const rows = rowsOf(data).filter((row) => !gone.has(row.key));
  const ownPermissions = data.ownPermissions;
  const isOwner = data.view === "owner";
  const managed = data.view === "member" ? null : data;
  const invites = managed?.invites.filter((invite) => !gone.has(inviteKey(invite))) ?? [];
  const alone = managed !== null && rows.length === 1 && invites.length === 0;

  useEffect(() => {
    focusNext.current?.focus();
    focusNext.current = null;
  }, [gone]);

  useEffect(() => {
    const pending = afterRefresh.current;
    if (!pending) return;
    afterRefresh.current = null;
    // Asked of the data, not the page: a row that left is still on the page while it exits.
    const keys = new Set([
      ...rowsOf(data).map((row) => row.key),
      ...(data.view === "member" ? [] : data.invites.map(inviteKey)),
    ]);
    if (keys.has(pending.key)) return;
    const targetKey = pending.target?.closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
    const stays = pending.target?.isConnected && targetKey !== undefined && keys.has(targetKey);
    (stays ? pending.target : heading.current)?.focus();
  }, [data]);

  /** Where focus goes once `key`'s row leaves: the next row's menu, the previous one's, the heading. */
  const focusAfter = (key: string): HTMLElement | null => {
    const items = Array.from(groups.current?.querySelectorAll<HTMLElement>("[data-row-key]") ?? []);
    const at = items.findIndex((item) => item.dataset.rowKey === key);
    const menuOf = (item: HTMLElement | undefined) =>
      item?.querySelector<HTMLElement>(ROW_MENU) ?? null;
    const after = items
      .slice(at + 1)
      .map(menuOf)
      .find(Boolean);
    const before = items.slice(0, Math.max(at, 0)).reverse().map(menuOf).find(Boolean);
    return after ?? before ?? heading.current;
  };

  /** `key`'s row leaves (removed, cancelled, or gone meanwhile): say so, refresh, move focus. */
  const leave = (key: string, message: string) => {
    focusNext.current = focusAfter(key);
    setGone((current) => new Set(current).add(key));
    setRemoval((current) => current && { ...current, open: false, pending: false });
    toast({ message });
    router.refresh();
  };

  /** `key`'s row may go with the refresh already under way: if it does, focus moves on. */
  const stale = (key: string) => {
    afterRefresh.current = { key, target: focusAfter(key) };
  };

  const confirmRemoval = async () => {
    if (!removal?.person.id || removal.pending) return;
    const { person } = removal;
    setRemoval({ ...removal, pending: true, error: null });
    const outcome = await removeMember(removal.person.id);
    if (outcome.ok) {
      leave(person.key, MEMBERS_COPY.remove.done(person.name));
      return;
    }
    const message = membersErrorMessage(
      outcome.error,
      { kind: "remove", name: person.name },
      context,
    );
    if (outcome.error === "gone" || outcome.error === "leaving") {
      leave(person.key, message);
      return;
    }
    const refused = ["owner-only", "not-allowed", "protected"].includes(outcome.error);
    setRemoval((current) => current && { ...current, pending: false, error: message, refused });
    if (refused) router.refresh();
  };

  return (
    <SettingsCard
      title={COPY.title}
      description={
        data.view === "member"
          ? COPY.description.member(data.workspaceName, owner)
          : COPY.description.managed(data.workspaceName)
      }
      icon="users"
      testId="people-card"
    >
      <div ref={groups} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="rounded-row px-3 text-meta font-semibold text-muted"
            data-testid="people-count"
          >
            {COPY.count(rows.length)}
          </h3>
          <motion.ul
            aria-labelledby={headingId}
            variants={GROUP}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-1"
          >
            <AnimatePresence>
              {rows.map((person) => (
                <MemberRow
                  key={person.key}
                  person={person}
                  ownPermissions={person.you && !isOwner ? ownPermissions : null}
                  context={context}
                  owner={owner}
                  permissionsOpen={openPanel === person.key}
                  onPermissionsOpenChange={(open) => setOpenPanel(open ? person.key : null)}
                  onRemove={() =>
                    setRemoval({ person, open: true, pending: false, error: null, refused: false })
                  }
                  onLeft={(message) => leave(person.key, message)}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
          {alone ? <PeopleEmpty left={seatsLeft(managed.seats)} /> : null}
        </div>
        {/* In presence: the group leaves with an exit once its last invite is cancelled. */}
        <AnimatePresence>
          {managed && actions && invites.length > 0 ? (
            <PendingInvites
              key="pending"
              invites={invites}
              actions={actions}
              context={context}
              onCopy={links.copy}
              onLeave={leave}
              onStale={stale}
            />
          ) : null}
        </AnimatePresence>
        {managed ? <LeavingMembers leaving={managed.leaving} /> : null}
      </div>
      {removal ? (
        <RemoveMemberDialog
          open={removal.open}
          name={removal.person.name}
          workspaceName={data.workspaceName}
          pending={removal.pending}
          error={removal.error}
          refused={removal.refused}
          onConfirm={() => void confirmRemoval()}
          onClose={() => setRemoval((current) => current && { ...current, open: false })}
        />
      ) : null}
      {links.shown ? (
        <InviteLinkDialog
          open={links.shown.open}
          email={links.shown.email}
          link={links.shown.link}
          onClose={links.close}
        />
      ) : null}
    </SettingsCard>
  );
}
