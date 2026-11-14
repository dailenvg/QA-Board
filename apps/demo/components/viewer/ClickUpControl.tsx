"use client";

import { useState } from "react";
import type { Project } from "@/lib/store/types";
import { useWorkspaceIdentity } from "@/lib/workspace-client/workspace-identity";
import { ClickUpLogo } from "../account/ClickUpLogo";
import { Button } from "../ui/Button";
import { useToast } from "../ui/ToastProvider";
import { ClickUpDialog } from "./ClickUpDialog";
import { CLICKUP_SEND_COPY } from "./clickup-send-copy";
import { useClickUpSend } from "./use-clickup-send";

const COPY = CLICKUP_SEND_COPY;

/**
 * The viewer's ClickUp button (beside Share, as it looks: icon only on
 * phones, named for screen readers) and its Send to ClickUp window. A send
 * closes the window and says where it went, with a way to open it in
 * ClickUp when ClickUp gave its link.
 */
export function ClickUpControl({ project }: { project: Project }) {
  const toast = useToast();
  const workspaceId = useWorkspaceIdentity()?.id ?? null;
  const [open, setOpen] = useState(false);
  const send = useClickUpSend({
    workspaceId,
    projectId: project.id,
    onSent: (channel, url) => {
      setOpen(false);
      toast({
        message: COPY.sent(channel),
        ...(url
          ? {
              action: {
                label: COPY.open,
                onAction: () => window.open(url, "_blank", "noopener,noreferrer"),
              },
            }
          : {}),
      });
    },
  });

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
        send={send}
      />
    </>
  );
}
