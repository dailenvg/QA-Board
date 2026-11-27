"use client";

import type { DialogState } from "@/lib/use-dialog-state";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { TEAM_ONLY_COPY as COPY } from "./team-only-copy";
import type { TeamOnlyAsk } from "./use-team-only-change";

interface TeamOnlyConfirmProps {
  asking: DialogState<TeamOnlyAsk>;
  /** A comment's number as shown now: "4", or "T1" for a team-only one. */
  numberOf: (commentId: string) => string;
  /** How many of a comment's replies stay team only when it's shown (those written while hidden). */
  keptBack: (commentId: string) => number;
  /** The project has a review link. */
  linked: boolean;
  onConfirm: () => void;
}

/** The dialog's words for what's asked. */
function copyFor(ask: TeamOnlyAsk, props: TeamOnlyConfirmProps) {
  if (ask.kind === "hide-comment") {
    return {
      title: COPY.hideConfirm.title(props.numberOf(ask.comment.id)),
      description: COPY.hideConfirm.body,
      confirmLabel: COPY.make,
      variant: "danger" as const,
    };
  }
  if (ask.kind === "show-comment") {
    return {
      title: COPY.showComment.title(props.numberOf(ask.comment.id)),
      description: COPY.showComment.body(props.linked, props.keptBack(ask.comment.id)),
      confirmLabel: COPY.show,
      variant: "primary" as const,
    };
  }
  return {
    title: COPY.showReply.title,
    description: COPY.showReply.body(props.numberOf(ask.reply.commentId), props.linked),
    confirmLabel: COPY.show,
    variant: "primary" as const,
  };
}

/**
 * Asks before a team-only change (U19): making a comment team only while it's on a review link,
 * in the danger look, since clients may have seen it; showing a comment or reply to the client
 * always, in the primary look, since publishing isn't data loss. Cancel takes the first focus, so
 * Enter never publishes by accident, and focus goes back to the More button that asked.
 */
export function TeamOnlyConfirm(props: TeamOnlyConfirmProps) {
  const { asking, onConfirm } = props;
  const copy = asking.payload ? copyFor(asking.payload, props) : null;
  return (
    <ConfirmDialog
      open={asking.open && copy !== null}
      title={copy?.title ?? ""}
      description={copy?.description ?? ""}
      confirmLabel={copy?.confirmLabel ?? COPY.show}
      confirmVariant={copy?.variant ?? "primary"}
      onConfirm={onConfirm}
      onClose={asking.close}
    />
  );
}
