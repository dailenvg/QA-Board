"use client";

import type { MembersData, PendingInvite } from "@/lib/workspace/members/members-data";
import { InviteCard } from "./InviteCard";
import { PeopleCard } from "./PeopleCard";
import { useInviteActions } from "./use-invite-actions";

const NO_INVITES: readonly PendingInvite[] = [];
const NO_SEATS = { used: 0, limit: 0 };

interface MembersSettingsProps {
  data: MembersData;
  /** When the page was read (epoch ms). */
  readAt: number;
}

/**
 * The Members section: who's in the workspace, as the signed-in user may see
 * them. The owner, and a member with the people switch, also get the invite
 * card above it (4b.2, 4b.14); both cards share how invites are resent.
 */
export function MembersSettings({ data, readAt }: MembersSettingsProps) {
  const managed = data.view === "member" ? null : data;
  const actions = useInviteActions({
    emailEnabled: managed?.emailEnabled ?? false,
    invites: managed?.invites ?? NO_INVITES,
    seats: managed?.seats ?? NO_SEATS,
    context: { ownerName: data.ownerName, workspaceName: data.workspaceName },
    readAt,
  });
  return (
    <div className="flex flex-col gap-4" data-testid="members-settings">
      {managed ? <InviteCard data={managed} actions={actions} /> : null}
      <PeopleCard data={data} actions={managed ? actions : null} />
    </div>
  );
}
