"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { ClickUpConnection } from "@/lib/integrations/clickup/connections";
import { disconnectClickUp } from "@/lib/integrations/clickup/settings-client";
import { usePopVariants } from "@/lib/motion";
import { absoluteTime, calendarDate } from "@/lib/relative-time";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { clickUpErrorMessage, INTEGRATIONS_COPY, type ClickUpNotice } from "./integrations-copy";

const COPY = INTEGRATIONS_COPY.clickUp;

interface ClickUpConnectedProps {
  connection: ClickUpConnection;
  /** Only the owner disconnects; members see what's connected. */
  isOwner: boolean;
  onNotice: (notice: ClickUpNotice | null) => void;
  /** Once disconnected: the row this sits in takes focus, as the button goes. */
  onDisconnected: () => void;
}

type Status = "idle" | "confirming" | "disconnecting";

/**
 * The connected ClickUp workspace, whose name posts appear under, who
 * connected it and when; for the owner,
 * Disconnect, which asks first, here in the row (Cancel focused, so Enter
 * never disconnects by accident).
 */
export function ClickUpConnected({
  connection,
  isOwner,
  onNotice,
  onDisconnected,
}: ClickUpConnectedProps) {
  const router = useRouter();
  const variants = usePopVariants();
  const confirmId = useId();
  const [status, setStatus] = useState<Status>("idle");
  /** Set by Cancel: focus goes back to Disconnect once it's back. */
  const refocus = useRef(false);
  const busy = status === "disconnecting";

  const cancel = () => {
    if (busy) return;
    refocus.current = true;
    setStatus("idle");
  };

  const disconnect = async () => {
    if (busy) return;
    setStatus("disconnecting");
    onNotice(null);
    const outcome = await disconnectClickUp();
    if (!outcome.ok) {
      setStatus("confirming");
      onNotice({ tone: "error", message: clickUpErrorMessage(outcome.error) });
      return;
    }
    onNotice({ tone: "info", message: COPY.disconnectedNotice });
    onDisconnected();
    router.refresh();
  };

  const { teamName, clickUpUsername, connectedBy, connectedAt } = connection;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body wrap-anywhere">
          {COPY.connectedTo}{" "}
          <strong className="font-semibold" data-testid="clickup-team">
            {teamName}
          </strong>
        </p>
        <p className="text-body wrap-anywhere">
          {COPY.postsAs}{" "}
          <strong className="font-semibold" data-testid="clickup-username">
            {clickUpUsername}
          </strong>
        </p>
        <p className="text-meta text-muted wrap-anywhere" data-testid="clickup-connected-by">
          {COPY.connectedBy(connectedBy)}{" "}
          <time dateTime={new Date(connectedAt).toISOString()} title={absoluteTime(connectedAt)}>
            {calendarDate(connectedAt)}
          </time>
        </p>
      </div>
      {isOwner ? (
        <AnimatePresence mode="wait" initial={false}>
          {status === "idle" ? (
            <motion.div
              key="idle"
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <Button
                ref={(button) => {
                  if (!button || !refocus.current) return;
                  refocus.current = false;
                  button.focus();
                }}
                variant="danger-ghost"
                onClick={() => setStatus("confirming")}
                className="max-sm:w-full"
                data-testid="clickup-disconnect"
              >
                <Icon name="close" className="size-5" />
                {COPY.disconnect}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="confirm"
              role="group"
              aria-labelledby={confirmId}
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onKeyDown={(event) => {
                if (event.key === "Escape") cancel();
              }}
              className="flex flex-col gap-4 rounded-tile bg-card p-4 shadow-seg"
              data-testid="clickup-disconnect-confirm"
            >
              <p id={confirmId} className="text-body text-pretty text-ink wrap-anywhere">
                {COPY.confirmDisconnect(teamName)}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={cancel}
                  aria-disabled={busy || undefined}
                  autoFocus
                >
                  {COPY.cancel}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void disconnect()}
                  aria-disabled={busy || undefined}
                  data-testid="clickup-disconnect-confirm-button"
                >
                  {busy ? COPY.disconnecting : COPY.disconnect}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        // Members see who can change it, as the not-connected state tells them.
        <p className="text-meta text-muted" data-testid="clickup-member-note">
          {COPY.memberOnly}
        </p>
      )}
    </div>
  );
}
