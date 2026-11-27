"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { WELCOME_PARAM } from "@/lib/auth/next-path";
import { emitSquiggy } from "@/lib/squiggy/events";
import { useToast } from "../ui/ToastProvider";

interface WelcomeSignalProps {
  /** The signed-in workspace's name, for a new member's welcome; null outside one. */
  workspaceName: string | null;
}

/**
 * The first page after signing in carries `?welcome=first` (the user's first
 * sign-in) or `?welcome=back`; after joining with an invite, `?welcome=joined`.
 * Squiggy greets once (by the workspace's name for a new member, who also
 * gets a toast saying they've joined) and the flag leaves the address, so a
 * reload or a shared link doesn't greet again. It leaves at once, from the
 * address as it is then, so a page tidying its own parameters meanwhile (a
 * comment link's `?comment=`) doesn't get them back. Renders nothing.
 */
export function WelcomeSignal({ workspaceName }: WelcomeSignalProps) {
  const params = useSearchParams();
  const toast = useToast();
  const welcome = params.get(WELCOME_PARAM);

  useEffect(() => {
    if (welcome === null) return;
    if (welcome === "joined" && workspaceName) {
      emitSquiggy({ type: "joined", workspace: workspaceName });
      toast({ message: `You've joined ${workspaceName}.` });
    } else {
      emitSquiggy({ type: "signed-in", first: welcome === "first" || welcome === "joined" });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete(WELCOME_PARAM);
    window.history.replaceState(window.history.state, "", url);
  }, [welcome, workspaceName, toast]);

  return null;
}
