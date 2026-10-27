"use client";

import { useEffect } from "react";
import { RETENTION_DAYS } from "@/lib/share/retention";
import { deleteExpiredProjects } from "@/lib/store/actions";
import { retentionStart } from "@/lib/store/expiry";
import type { Project } from "@/lib/store/types";
import { useSquint } from "@/lib/store/use-squint";
import { useDocumentVisible } from "@/lib/use-document-visible";
import { useToast } from "../ui/ToastProvider";

/** Said once, politely, after projects are deleted for age (Writer: copy here). */
function deletedMessage(projects: readonly Project[]): string {
  const [first] = projects;
  if (projects.length === 1 && first) {
    return `${first.name} was over ${RETENTION_DAYS} days old, so it was deleted.`;
  }
  return `${projects.length} projects over ${RETENTION_DAYS} days old were deleted.`;
}

/**
 * Deletes this browser's projects once they pass retention (see
 * `lib/store/expiry.ts`): when the workspace loads, and each time the tab
 * comes back into view. Says so in a toast (a polite live region) when it
 * deletes anything; deleted projects are gone, so it's never said twice.
 * On mount it saves when retention started in this browser, if it hasn't yet,
 * so render only ever reads it (`readRetentionStart`). Renders nothing itself.
 */
export function LocalExpiry() {
  const ready = useSquint().status === "ready";
  const visible = useDocumentVisible();
  const toast = useToast();

  useEffect(() => {
    retentionStart();
  }, []);

  useEffect(() => {
    if (!ready || !visible) return;
    const deleted = deleteExpiredProjects();
    if (deleted.length > 0) toast({ message: deletedMessage(deleted) });
  }, [ready, visible, toast]);

  return null;
}
