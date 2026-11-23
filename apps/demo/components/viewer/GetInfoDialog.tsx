"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { clientInfoText, describeClientInfo, type InfoRow } from "@/lib/client-info/describe";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { Comment } from "@/lib/store/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { StateArt } from "../ui/line-art/StateArt";
import { useToast } from "../ui/ToastProvider";

const ROWS = staggerGroup();

const NOT_RECORDED = "Not recorded. This was posted before Squint kept browser details.";

interface GetInfoDialogProps {
  open: boolean;
  /** Kept after closing (`useDialogState`), so the details stay put while the dialog leaves. */
  comment: Comment | null;
  number: number;
  onClose: () => void;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The rows as a definition list, each label beside its value, staggering in. */
function InfoList({ rows }: { rows: readonly InfoRow[] }) {
  const reveal = useRevealVariants();
  return (
    <motion.dl
      variants={ROWS}
      initial="hidden"
      animate="visible"
      data-testid="browser-details"
      className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-body"
    >
      {rows.map((row) => (
        <motion.div key={row.label} variants={reveal} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted">{row.label}</dt>
          <dd className="font-semibold wrap-break-word">{row.value}</dd>
        </motion.div>
      ))}
    </motion.dl>
  );
}

/**
 * "Get info" for the team: the browser a comment was posted from, in words
 * (`describeClientInfo`), with "Copy details" for a bug report. Comments from
 * before Squint kept them say so. Never shown to guests.
 */
export function GetInfoDialog({ open, comment, number, onClose }: GetInfoDialogProps) {
  const toast = useToast();
  const emptyId = useId();
  const info = comment?.clientInfo;
  const rows = comment
    ? describeClientInfo(info, comment.fromClient ? "review-link" : "squint")
    : null;

  const copyDetails = async () => {
    if (!rows || !info) return;
    const copied = await copy(clientInfoText(rows, info));
    toast(
      copied
        ? { message: "Details copied." }
        : { tone: "error", message: "Couldn't copy the details." },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Browser details"
      description={comment ? `Comment ${number} by ${comment.author}` : undefined}
      size="sm"
      testId="get-info-dialog"
    >
      {rows ? (
        <InfoList rows={rows} />
      ) : (
        // Line art as in the other small surfaces' empty states (search, Send to ClickUp).
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <StateArt scene="noMatch" size="sm" still />
          <p
            id={emptyId}
            data-testid="browser-details-empty"
            className="text-body text-pretty text-ink-2"
          >
            {NOT_RECORDED}
          </p>
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {rows ? (
          <Button variant="secondary" onClick={() => void copyDetails()}>
            <Icon name="copy" className="size-4" />
            Copy details
          </Button>
        ) : null}
        {/* Focused on opening: without details, it reads out why, as the dialog only names the comment. */}
        <Button onClick={onClose} aria-describedby={rows ? undefined : emptyId} data-autofocus>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
