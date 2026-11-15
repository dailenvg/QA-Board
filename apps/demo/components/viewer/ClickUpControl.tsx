"use client";

import { useState } from "react";
import type { Project } from "@/lib/store/types";
import { useWorkspaceIdentity } from "@/lib/workspace-client/workspace-identity";
import { ClickUpLogo } from "../account/ClickUpLogo";
import { Button } from "../ui/Button";
import { ClickUpDialog } from "./ClickUpDialog";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import { useClickUpSend } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY;

/**
 * The viewer's ClickUp button (beside Share, as it looks: icon only on
 * phones, named for screen readers) and its Send to ClickUp window, which
 * stays open after a send to say what's left: pasting the link in ClickUp.
 */
export function ClickUpControl({ project, sender }: { project: Project; sender: string }) {
  const workspaceId = useWorkspaceIdentity()?.id ?? null;
  const [open, setOpen] = useState(false);
  const send = useClickUpSend({ workspaceId, projectId: project.id });

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
          send.start();
        }}
        className="max-sm:size-11 max-sm:px-0"
        aria-label={COPY.buttonLabel}
        title={COPY.buttonLabel}
        aria-haspopup="dialog"
        data-testid="clickup-button"
      >
        <ClickUpLogo className="size-5" />
        <span className="max-sm:sr-only">{COPY.button}</span>
      </Button>
      <ClickUpDialog
        open={open}
        onClose={() => setOpen(false)}
        project={{ id: project.id, name: project.name }}
        sender={sender}
        send={send}
      />
    </>
  );
}
