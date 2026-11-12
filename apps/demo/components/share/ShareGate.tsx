"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { useScreenVariants } from "@/lib/motion";
import { createDraftStorage, type DraftStorage } from "@/lib/share-client/draft-storage";
import { reviewerNameOf } from "@/lib/share-client/reviewer-name";
import type { ClientView, LockedShare } from "@/lib/share/types";
import { SharedReview } from "./SharedReview";
import { ShareLocked } from "./ShareLocked";
import { ShareUnavailable } from "./ShareUnavailable";

/** What the server found the link open to for this request. */
export type GuestOpening = ({ locked: true } & LockedShare) | { locked: false; view: ClientView };

interface ShareGateProps {
  token: string;
  initial: GuestOpening;
  /** The reviewer's name remembered for this link (its cookie), so the page renders with it. */
  authorName: string | null;
}

type Screen =
  | ({ kind: "locked"; notice: string | null } & LockedShare)
  | { kind: "review"; view: ClientView; authorName: string | null; drafts: DraftStorage }
  | { kind: "gone" };

/** Back on the password screen after the review was open: the password changed, or the pass ran out. */
const RELOCKED = "Enter the password again to carry on.";
const RELOCKED_WITH_DRAFT = "Enter the password again to carry on. Your unsent comment is kept.";
/** What a draft kept through the password screen says about itself when the review is back. */
const RESUMED_DRAFT = "This comment wasn't sent yet. Retry to post it, or cancel it.";

/** After unlocking, focus goes to the review's title rather than falling to the page. */
function focusTitle(root: HTMLElement | null): void {
  if (!root || (document.activeElement && document.activeElement !== document.body)) return;
  const title = root.querySelector<HTMLElement>("h1");
  if (!title) return;
  if (!title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1");
  title.focus({ preventScroll: true });
}

/**
 * A guest's review link, from its password screen to the review and back.
 * Unlocking reads the review in place (no reload); a review that asks for its
 * password again (polling, a comment or a snapshot answering 401
 * `password-required`) gives way to the password screen, keeping an unsent
 * comment in memory and in this tab's sessionStorage until it's back.
 */
export function ShareGate({ token, initial, authorName }: ShareGateProps) {
  const variants = useScreenVariants();
  const [drafts] = useState(() => createDraftStorage(token));
  const [screen, setScreen] = useState<Screen>(() =>
    initial.locked
      ? { kind: "locked", brand: initial.brand, projectName: initial.projectName, notice: null }
      : { kind: "review", view: initial.view, authorName, drafts },
  );
  /** Set once the screen has changed in this tab: the first one is the server's, already shown. */
  const [switched, setSwitched] = useState(false);
  const reviewRoot = useRef<HTMLDivElement>(null);

  const lock = useCallback(
    (locked: LockedShare) => {
      setSwitched(true);
      setScreen((current) =>
        current.kind === "review"
          ? {
              kind: "locked",
              ...locked,
              notice: drafts.load()?.body.trim() ? RELOCKED_WITH_DRAFT : RELOCKED,
            }
          : current,
      );
    },
    [drafts],
  );

  const open = (view: ClientView, relocked: boolean) => {
    setSwitched(true);
    setScreen({
      kind: "review",
      view,
      // Named in this tab since the page loaded, maybe: the cookie has the latest.
      authorName: reviewerNameOf(document.cookie) ?? authorName,
      drafts: relocked ? { ...drafts, restoredNotice: RESUMED_DRAFT } : drafts,
    });
  };

  return (
    <AnimatePresence mode="wait">
      {screen.kind === "gone" ? (
        // Brings its own entrance, as the password screen does. Nothing replaces it yet; the exit
        // is there so it never pops out if something does.
        <motion.div key="gone" variants={variants} initial={false} animate="visible" exit="exit">
          <ShareUnavailable />
        </motion.div>
      ) : screen.kind === "locked" ? (
        // Brings its own entrance; this only fades it out for what replaces it.
        <motion.div key="locked" variants={variants} initial={false} animate="visible" exit="exit">
          <ShareLocked
            token={token}
            brand={screen.brand}
            projectName={screen.projectName}
            notice={screen.notice}
            onUnlocked={(view) => open(view, screen.notice !== null)}
            onGone={() => setScreen({ kind: "gone" })}
          />
        </motion.div>
      ) : (
        <motion.div
          key="review"
          ref={reviewRoot}
          variants={variants}
          // The server's first screen shows as rendered; one that replaces another fades in
          // (opacity only, so the review's fixed bottom sheets are placed right from the start).
          initial={switched ? "hidden" : false}
          animate="visible"
          exit="exit"
          onAnimationComplete={(definition) => {
            if (switched && definition === "visible") focusTitle(reviewRoot.current);
          }}
        >
          <SharedReview
            token={token}
            initial={screen.view}
            authorName={screen.authorName}
            draftStorage={screen.drafts}
            onLocked={lock}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
