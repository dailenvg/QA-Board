import { useState } from "react";
import type { ModeratedDelete } from "@/lib/store/actions";
import { ownerLabel } from "@/lib/workspace-client/permission-copy";

/** What's being deleted for good, for the dialog's refusals. */
export type DeletedNoun = "comment" | "reply";

const PLURAL: Record<DeletedNoun, string> = { comment: "comments", reply: "replies" };

/** What the dialog says when a delete didn't go through; null when it closes instead. */
function failure(outcome: ModeratedDelete, noun: DeletedNoun, ownerName: string | null) {
  switch (outcome) {
    case "owner-only":
      return `Only ${ownerLabel(ownerName)} can delete other people's ${PLURAL[noun]}.`;
    case "offline":
      return `Couldn't delete the ${noun}. Check your connection and try again.`;
    case "failed":
      return `Couldn't delete the ${noun}. Something went wrong on our side, so try again in a moment.`;
    default:
      return null;
  }
}

/**
 * A confirm that deletes for good and waits for the server ("Deleting…",
 * the dialog staying up): `run` resolves to how it went once it's gone
 * (`deleted`, or `gone` when it already was), or null after a refusal, which
 * `error` says in the dialog; confirming again tries again.
 */
export function useModeratedDelete(noun: DeletedNoun, ownerName: string | null) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    remove: () => Promise<ModeratedDelete>,
  ): Promise<"deleted" | "gone" | null> => {
    setPending(true);
    setError(null);
    const outcome = await remove();
    setPending(false);
    const refused = failure(outcome, noun, ownerName);
    if (refused) {
      setError(refused);
      return null;
    }
    return outcome === "gone" ? "gone" : "deleted";
  };

  return { pending, error, clearError: () => setError(null), run };
}
