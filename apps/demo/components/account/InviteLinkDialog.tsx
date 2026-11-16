"use client";

import { useId } from "react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FIELD_CLASS } from "../ui/field-styles";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.invites.linkDialog;

interface InviteLinkDialogProps {
  open: boolean;
  email: string;
  link: string;
  onClose: () => void;
}

/**
 * When the browser wouldn't copy an invite's link (4b.2): the link in a
 * read-only field, already selected, so it can be copied by hand.
 */
export function InviteLinkDialog({ open, email, link, onClose }: InviteLinkDialogProps) {
  const fieldId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={COPY.title(email)}
      size="sm"
      testId="invite-link-dialog"
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose} className="max-sm:w-full">
            {COPY.done}
          </Button>
        </div>
      }
    >
      <label htmlFor={fieldId} className="mb-2 block text-body font-semibold">
        {COPY.label}
      </label>
      <input
        id={fieldId}
        type="text"
        readOnly
        value={link}
        data-autofocus
        onFocus={(event) => event.currentTarget.select()}
        className={FIELD_CLASS}
        data-testid="invite-link-field"
      />
    </Dialog>
  );
}
