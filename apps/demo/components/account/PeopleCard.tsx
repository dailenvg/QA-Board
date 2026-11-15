"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { membersErrorMessage, removeMember } from "@/lib/account/members-client";
import { staggerGroup } from "@/lib/motion";
import { ownerLabel, type AskContext } from "@/lib/workspace-client/permission-copy";
import type { MembersData } from "@/lib/workspace/members/members-data";
import { useToast } from "../ui/ToastProvider";
import { MemberRow } from "./MemberRow";
import { MEMBERS_COPY } from "./members-copy";
import { rowsOf, type PersonRow } from "./people-rows";
import { RemoveMemberDialog } from "./RemoveMemberDialog";
import { SettingsCard } from "./SettingsCard";

const COPY = MEMBERS_COPY.people;
const GROUP = staggerGroup();

/** The removal being confirmed, and how its request went. */
interface Removal {
  person: PersonRow;
  open: boolean;
  pending: boolean;
  error: string | null;
  refused: boolean;
}

/**
 * The People card (4b.2, 4b.3, 4b.14): everyone in the workspace, the owner
 * first. The owner sees each member's Permissions; the owner, and a member
 * with the people switch, can remove the members they may (D1); a member
 * sees their own permissions under their row. Nothing is optimistic: a row
 * leaves once the server has removed them, and focus goes to the next row's
 * menu (else the previous one's, else the list's heading).
 */
export function PeopleCard({ data }: { data: MembersData }) {
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  /** Focus's next place once a row has left: moved after the dialog has given focus back. */
  const focusNext = useRef<HTMLElement | null>(null);

  const context: AskContext = { ownerName: data.ownerName, workspaceName: data.workspaceName };
  const owner = ownerLabel(data.ownerName);
  const rows = rowsOf(data).filter((row) => !gone.has(row.key));
  const ownPermissions = data.ownPermissions;
  const isOwner = data.view === "owner";

  useEffect(() => {
    focusNext.current?.focus();
    focusNext.current = null;
  }, [gone]);

  /** Where focus goes once `key`'s row leaves: the next row's menu, the previous one's, the heading. */
  const focusAfter = (key: string): HTMLElement | null => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-row-key]") ?? []);
    const at = items.findIndex((item) => item.dataset.rowKey === key);
    const menuOf = (item: HTMLElement | undefined) =>
      item?.querySelector<HTMLElement>('[data-testid="member-menu"]') ?? null;
    const after = items
      .slice(at + 1)
      .map(menuOf)
      .find(Boolean);
    const before = items.slice(0, Math.max(at, 0)).reverse().map(menuOf).find(Boolean);
    return after ?? before ?? heading.current;
  };

  /** `person`'s row leaves (removed, or gone meanwhile): tell the owner, refresh, move focus. */
  const leave = (person: PersonRow, message: string) => {
    focusNext.current = focusAfter(person.key);
    setGone((current) => new Set(current).add(person.key));
    setRemoval((current) => current && { ...current, open: false, pending: false });
    toast({ message });
    router.refresh();
  };

  const confirmRemoval = async () => {
    if (!removal?.person.id || removal.pending) return;
    const { person } = removal;
    setRemoval({ ...removal, pending: true, error: null });
    const outcome = await removeMember(removal.person.id);
    if (outcome.ok) {
      leave(person, MEMBERS_COPY.remove.done(person.name));
      return;
    }
    const message = membersErrorMessage(
      outcome.error,
      { kind: "remove", name: person.name },
      context,
    );
    if (outcome.error === "gone" || outcome.error === "leaving") {
      leave(person, message);
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
          ref={list}
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
                onLeft={(message) => leave(person, message)}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
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
    </SettingsCard>
  );
}
