"use client";

import { useId } from "react";
import { Icon } from "../ui/Icon";
import { Switch } from "../ui/Switch";

/** Where a switch's save is: nothing to say, on its way, just done, or failed (and why). */
export type SwitchStatus =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

interface PermissionSwitchProps {
  label: string;
  description: string;
  /** Read only after the label, so every switch on the page has a name of its own. */
  forName: string;
  checked: boolean;
  /** Any switch of the panel is saving: none can be pressed until it's answered. */
  inactive: boolean;
  status: SwitchStatus;
  savingText: string;
  savedText: string;
  onToggle: () => void;
  testId?: string;
}

/**
 * One of a member's switches in the owner's Permissions panel: its name and
 * what it allows on the left (wrapping freely), the switch on the right, and a
 * status line under the description that says it's saving, saved, or why it
 * didn't save. The switch only moves once the server has it.
 */
export function PermissionSwitch({
  label,
  description,
  forName,
  checked,
  inactive,
  status,
  savingText,
  savedText,
  onToggle,
  testId,
}: PermissionSwitchProps) {
  const labelId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const errorId = useId();
  const progress =
    status.kind === "saving" ? savingText : status.kind === "saved" ? savedText : null;
  return (
    <div className="flex items-start justify-between gap-4" data-testid={testId}>
      {/* pt-3: the label's first line sits level with the switch's track (centred in its 44px target). */}
      <div className="flex min-w-0 flex-col gap-0.5 pt-3">
        <span id={labelId} className="text-body font-semibold">
          {label}
          {/* Inside the label, so the switch's name is "Manage client review links for Ana Ruiz". */}
          <span className="sr-only">{forName}</span>
        </span>
        {/*
          "Saving…" and "Saved." take the description's place, in one grid cell, so the switches
          below never shift under the pointer; the description comes back once it's quiet.
        */}
        <span className="grid text-meta">
          <span
            id={descriptionId}
            className={`col-start-1 row-start-1 text-muted ${progress ? "invisible" : ""}`}
          >
            {description}
          </span>
          <span
            id={statusId}
            role="status"
            className="col-start-1 row-start-1 font-medium text-brand-text"
          >
            {progress}
          </span>
        </span>
        {status.kind === "error" ? (
          // FieldError's look, the project's inline error; 8px under the description with the gap.
          <span
            id={errorId}
            role="alert"
            className="mt-1.5 flex items-start gap-2 text-meta font-medium text-danger"
          >
            <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 wrap-anywhere">{status.message}</span>
          </span>
        ) : null}
      </div>
      <Switch
        checked={checked}
        onChange={onToggle}
        labelledBy={labelId}
        // The error's id too, so focusing the switch again reads why it didn't save.
        describedBy={`${descriptionId} ${statusId}${status.kind === "error" ? ` ${errorId}` : ""}`}
        inactive={inactive}
        testId={testId ? `${testId}-switch` : undefined}
      />
    </div>
  );
}
