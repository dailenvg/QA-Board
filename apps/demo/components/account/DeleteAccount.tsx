"use client";

import { useState } from "react";
import type { DeletionConfirm } from "@/lib/account/field-rules";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { DELETE_ACCOUNT_COPY } from "./delete-account-copy";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { SettingsCard } from "./SettingsCard";

/**
 * Deleting the account, behind a dialog that asks for the workspace's name
 * (a member: their email) and the current password. Never shown to the admin.
 */
export function DeleteAccount({ confirm }: { confirm: DeletionConfirm }) {
  const [open, setOpen] = useState(false);
  const description =
    confirm.kind === "workspace"
      ? DELETE_ACCOUNT_COPY.description.workspace(confirm.text)
      : DELETE_ACCOUNT_COPY.description.email;
  return (
    <SettingsCard
      title={DELETE_ACCOUNT_COPY.title}
      description={description}
      icon="trash"
      testId="delete-account-settings"
    >
      <Button
        variant="danger"
        onClick={() => setOpen(true)}
        className="self-start max-sm:self-stretch"
        data-testid="delete-account"
      >
        <Icon name="trash" className="size-5" />
        {DELETE_ACCOUNT_COPY.open}
      </Button>
      <DeleteAccountDialog open={open} confirm={confirm} onClose={() => setOpen(false)} />
    </SettingsCard>
  );
}
