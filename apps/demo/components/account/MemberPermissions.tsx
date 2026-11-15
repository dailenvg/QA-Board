"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { membersErrorMessage, saveMemberSwitches } from "@/lib/account/members-client";
import { MEMBER_SWITCHES, type MemberSwitch } from "@/lib/auth/permissions";
import { instant, spring, usePopVariants } from "@/lib/motion";
import { useTimedFlag } from "@/lib/use-timed-flag";
import type { AskContext } from "@/lib/workspace-client/permission-copy";
import { Icon } from "../ui/Icon";
import { MEMBERS_COPY } from "./members-copy";
import { PermissionSwitch, type SwitchStatus } from "./PermissionSwitch";

const COPY = MEMBERS_COPY.permissions;

/** How long "Saved." stays before the line is quiet again. */
const SAVED_MS = 2000;

interface MemberPermissionsProps {
  userId: string;
  /** Their name as the row shows it. */
  name: string;
  /** Their switches as the page loaded them. */
  initial: readonly MemberSwitch[];
  context: AskContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** They left the workspace meanwhile (removed, or deleted their account): what to tell the owner. */
  onLeft: (message: string) => void;
}

/** A refused or failed save: on which switch, and what to say there. */
type Failure = { value: MemberSwitch; message: string } | null;

/**
 * The owner's switches for one member (4b.2a): a full-width trigger under the
 * row that sums up what's on, and a panel of the four switches below it. A
 * press waits for the server (nothing optimistic about a permission): every
 * switch of the panel goes read-only and the pressed one says "Saving…",
 * then the thumb moves and it says "Saved." for a moment, or the switch stays
 * and says why. Escape in the panel closes it, back to the trigger.
 */
export function MemberPermissions({
  userId,
  name,
  initial,
  context,
  open,
  onOpenChange,
  onLeft,
}: MemberPermissionsProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const variants = usePopVariants();
  const panelId = useId();
  const groupLabelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [switches, setSwitches] = useState<readonly MemberSwitch[]>(initial);
  const [saving, setSaving] = useState<MemberSwitch | null>(null);
  const [savedValue, setSavedValue] = useState<MemberSwitch | null>(null);
  const [savedShowing, showSaved] = useTimedFlag(SAVED_MS);
  const [failure, setFailure] = useState<Failure>(null);

  const toggle = async (value: MemberSwitch) => {
    if (saving) return;
    const next = switches.includes(value)
      ? switches.filter((entry) => entry !== value)
      : MEMBER_SWITCHES.filter((entry) => entry === value || switches.includes(entry));
    setSaving(value);
    setFailure(null);
    const outcome = await saveMemberSwitches(userId, next);
    setSaving(null);
    if (outcome.ok) {
      setSwitches(outcome.permissions);
      setSavedValue(value);
      showSaved();
      return;
    }
    const message = membersErrorMessage(outcome.error, { kind: "switches", name }, context);
    if (outcome.error === "gone" || outcome.error === "leaving") {
      onOpenChange(false);
      onLeft(message);
      return;
    }
    setFailure({ value, message });
    if (outcome.error === "owner-only") router.refresh();
  };

  const statusOf = (value: MemberSwitch): SwitchStatus => {
    if (saving === value) return { kind: "saving" };
    if (failure?.value === value) return { kind: "error", message: failure.message };
    if (savedShowing && savedValue === value) return { kind: "saved" };
    return { kind: "idle" };
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    // Stays up while a change is on its way (as a dialog does), so its answer, or its error, is seen.
    if (saving) return;
    onOpenChange(false);
    trigger.current?.focus();
  };

  return (
    <div className="flex flex-col">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        // Only while the panel exists (as Menu does): never pointing at a missing id.
        aria-controls={open ? panelId : undefined}
        onClick={() => onOpenChange(!open)}
        data-testid="member-permissions-trigger"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-row px-3 py-2 text-left text-meta font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:-outline-offset-2 active:bg-seg"
      >
        <span className="min-w-0">{COPY.trigger(switches)}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? instant : spring.snappy}
          className="shrink-0"
        >
          <Icon name="chevronDown" className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            role="group"
            aria-labelledby={groupLabelId}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onKeyDown={onPanelKeyDown}
            data-testid="member-permissions"
            // bg-panel, not bg-tile: an off switch's outline (--field-line) is 3.1:1 on panel but
            // 2.8:1 on tile, under WCAG 1.4.11's 3:1.
            className="mt-1 flex flex-col gap-4 rounded-tile bg-panel px-4 py-3"
          >
            <span id={groupLabelId} className="sr-only">
              {COPY.group(name)}
            </span>
            {MEMBER_SWITCHES.map((value) => (
              <PermissionSwitch
                key={value}
                label={COPY.switches[value].label}
                description={COPY.switches[value].description(context.workspaceName)}
                forName={COPY.forName(name)}
                checked={switches.includes(value)}
                inactive={saving !== null}
                status={statusOf(value)}
                savingText={COPY.saving}
                savedText={COPY.saved}
                onToggle={() => void toggle(value)}
                testId={`permission-${value}`}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
