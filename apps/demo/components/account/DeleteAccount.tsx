"use client";

import { useState } from "react";
import type { SessionDeletion } from "@/lib/account/field-rules";
import { ACCOUNT_MEMBERS_HREF } from "@/lib/routes";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { DELETE_ACCOUNT_COPY } from "./delete-account-copy";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { SettingsCard } from "./SettingsCard";

const COPY = DELETE_ACCOUNT_COPY;

function descriptionOf({ confirm, otherMembers }: SessionDeletion): string {
  if (confirm.kind === "email") return COPY.description.email(confirm.workspaceName);
  return otherMembers
    ? COPY.description.ownerWithMembers(confirm.workspaceName)
    : COPY.description.workspace(confirm.workspaceName);
}

/**
 * Deleting the account, behind a dialog that asks for the workspace's name
 * (a member: their email) and the current password. An owner whose workspace
 * still has other people is told up front and sent to Members instead (A9b).
 * Never shown to the admin.
 */
export function DeleteAccount({ deletion, email }: { deletion: SessionDeletion; email: string }) {
  const [open, setOpen] = useState(false);
  const blocked = deletion.confirm.kind === "workspace" && deletion.otherMembers;
  return (
    <SettingsCard
      title={COPY.title}
      description={descriptionOf(deletion)}
      icon="trash"
      testId="delete-account-settings"
    >
      {blocked ? (
        <ButtonLink
          href={ACCOUNT_MEMBERS_HREF}
          variant="secondary"
          className="self-start max-sm:self-stretch"
          testId="delete-account-members"
        >
          <Icon name="users" className="size-5" />
          {COPY.goToMembers}
        </ButtonLink>
      ) : (
        <>
          <Button
            variant="danger"
            onClick={() => setOpen(true)}
            className="self-start max-sm:self-stretch"
            data-testid="delete-account"
          >
            <Icon name="trash" className="size-5" />
            {COPY.open}
          </Button>
          <DeleteAccountDialog
            open={open}
            confirm={deletion.confirm}
            pendingInvites={deletion.pendingInvites}
            email={email}
            onClose={() => setOpen(false)}
          />
        </>
      )}
    </SettingsCard>
  );
}
