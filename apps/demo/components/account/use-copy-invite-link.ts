"use client";

import { useState } from "react";
import { useToast } from "../ui/ToastProvider";
import { MEMBERS_COPY } from "./members-copy";

const COPY = MEMBERS_COPY.invites;

/** The link shown by hand, after the browser wouldn't copy it. */
export interface ShownLink {
  email: string;
  link: string;
  open: boolean;
}

/**
 * Copying an invite's link (4.1, 4b.2). The write starts inside the tap,
 * before anything is awaited: Safari refuses the clipboard once the tap's
 * activation is spent on a request. A toast says it worked; if it didn't,
 * its "Show link" opens the link in a dialog to copy by hand.
 */
export function useCopyInviteLink() {
  const toast = useToast();
  const [shown, setShown] = useState<ShownLink | null>(null);

  const copy = (email: string, link: string) => {
    let writing: Promise<void>;
    try {
      writing = navigator.clipboard.writeText(link);
    } catch {
      // No clipboard at all (an insecure context): the same as a refusal.
      writing = Promise.reject(new Error("no clipboard"));
    }
    void writing.then(
      () => toast({ message: COPY.copied }),
      () =>
        toast({
          message: COPY.copyFailed,
          tone: "error",
          action: { label: COPY.showLink, onAction: () => setShown({ email, link, open: true }) },
        }),
    );
  };

  const close = () => setShown((current) => current && { ...current, open: false });

  return { copy, shown, close };
}
