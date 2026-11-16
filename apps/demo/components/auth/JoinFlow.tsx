"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginErrorMessage } from "@/lib/auth/auth-client";
import { joinFlagMessage } from "@/lib/auth/form-flags";
import type { JoinError } from "@/lib/auth/join-client";
import { useScreenVariants } from "@/lib/motion";
import type { JoinPageState } from "@/lib/workspace/members/join-page";
import { JoinConfirm } from "./JoinConfirm";
import { JoinForm } from "./JoinForm";
import { JOIN_COPY } from "./join-copy";
import { JoinStatePanel } from "./JoinStatePanel";
import { TextLink } from "./TextLink";

/** What the page can show: an invitee already in is sent to the Overview by the server. */
export type JoinShown = Exclude<JoinPageState, { kind: "member" }>;

interface JoinFlowProps {
  token: string;
  /** As the server read it for this request. */
  state: JoinShown;
  signedIn: boolean;
  /** A form post refused before the page hydrated (from `?error=`). */
  initialError: string | null;
}

/** A state the page swapped to after a refused POST, while the server's is still `from`. */
interface Swap {
  from: JoinShown;
  to: JoinShown;
}

/**
 * An invite's page (4b.6): the server's state, or, after a refused join,
 * the state the refusal says (expired, used, cancelled, full, closing, sign
 * in first), with focus on its title. A refusal only the server can draw
 * (another account, another workspace) refreshes the page, then focuses the
 * new title. States swap with a fade (`useScreenVariants`), one at a time.
 */
export function JoinFlow({ token, state, signedIn, initialError }: JoinFlowProps) {
  const router = useRouter();
  const variants = useScreenVariants();
  const [swap, setSwap] = useState<Swap | null>(null);
  const [afterSubmit, setAfterSubmit] = useState(false);
  // A swap holds only until the server's next read replaces the state it was made over.
  const shown = swap && swap.from === state ? swap.to : state;

  const swapTo = (to: JoinShown) => {
    setAfterSubmit(true);
    setSwap({ from: state, to });
    return null;
  };

  const refresh = () => {
    setAfterSubmit(true);
    setSwap(null);
    router.refresh();
    return null;
  };

  /** A refused join: a panel of its own (null), or the message for the form. */
  const refused = (error: JoinError, retryAfterSeconds = 0): string | null => {
    const brand = "brand" in shown ? shown.brand : null;
    const email = "email" in shown ? shown.email : null;
    switch (error) {
      case "expired":
      case "cancelled":
      case "used":
        return brand ? swapTo({ kind: error, brand }) : refresh();
      case "seats-full":
        return brand ? swapTo({ kind: "full", brand }) : refresh();
      case "account-closing":
        return brand && email ? swapTo({ kind: "account-closing", brand, email }) : refresh();
      case "sign-in-first":
        return brand && email ? swapTo({ kind: "sign-in", brand, email }) : refresh();
      case "not-found":
        return swapTo({ kind: "unknown" });
      case "wrong-account":
      case "cannot-join":
      case "in-another-workspace":
        return refresh();
      case "invalid":
        return joinFlagMessage("invalid");
      case "rate-limited":
        return loginErrorMessage("rate-limited", retryAfterSeconds);
      case "offline":
        return loginErrorMessage("failed");
      case "failed":
        return joinFlagMessage("unavailable");
    }
  };

  const footer = signedIn ? (
    <TextLink href="/">{JOIN_COPY.app}</TextLink>
  ) : (
    <TextLink href="/login">{JOIN_COPY.back}</TextLink>
  );
  const common = { token, focusTitle: afterSubmit, footer };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={shown.kind}
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="exit"
        data-testid="join-page"
        data-state={shown.kind}
      >
        {shown.kind === "new-person" ? (
          <JoinForm
            {...common}
            brand={shown.brand}
            email={shown.email}
            inviter={shown.inviter}
            initialError={initialError}
            onRefused={refused}
          />
        ) : shown.kind === "join" ? (
          <JoinConfirm
            {...common}
            brand={shown.brand}
            inviter={shown.inviter}
            initialError={initialError}
            onRefused={refused}
          />
        ) : (
          <JoinStatePanel {...common} state={shown} signedIn={signedIn} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
