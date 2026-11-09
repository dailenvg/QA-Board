"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  accountErrorMessage,
  saveWorkspaceSettings,
  type WorkspaceSettingsValues,
} from "@/lib/account/account-client";
import {
  brandColorError,
  normalizeBrandColor,
  normalizeSenderName,
  senderNameError,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceNameError,
} from "@/lib/account/field-rules";
import { SENDER_NAME_MAX } from "@/lib/email/from-header";
import { AuthField } from "../auth/AuthField";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { BrandColorField } from "./BrandColorField";
import { InvitePreview } from "./InvitePreview";
import { SettingsCard } from "./SettingsCard";
import { useCheckedField } from "./use-checked-field";

interface WorkspaceFormProps {
  initial: WorkspaceSettingsValues;
  /** Shown, never edited: set when the workspace was made. */
  slug: string;
  /** The current logo, for the preview. */
  logoSrc: string | null;
}

type Status = "idle" | "saving" | "saved";

/** The form's fields as the route takes them. */
function valuesOf(name: string, color: string, sender: string): WorkspaceSettingsValues {
  return {
    name: name.trim(),
    brandColor: normalizeBrandColor(color),
    senderName: normalizeSenderName(sender),
  };
}

function sameValues(a: WorkspaceSettingsValues, b: WorkspaceSettingsValues): boolean {
  return a.name === b.name && a.brandColor === b.brandColor && a.senderName === b.senderName;
}

/**
 * The workspace's name, brand color and email sender name, saved together,
 * with a preview of what guests see that follows every edit before it's saved.
 */
export function WorkspaceForm({ initial, slug, logoSrc }: WorkspaceFormProps) {
  const router = useRouter();
  const name = useCheckedField(workspaceNameError, initial.name);
  const color = useCheckedField(brandColorError, initial.brandColor ?? "");
  const sender = useCheckedField(senderNameError, initial.senderName ?? "");
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const senderRef = useRef<HTMLInputElement>(null);
  const values = valuesOf(name.value, color.value, sender.value);
  const unchanged = sameValues(values, saved);

  /** Every edit makes "saved" stale. */
  const edited = (field: { onChange: (value: string) => void }) => (value: string) => {
    field.onChange(value);
    if (status === "saved") setStatus("idle");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "saving" || unchanged) return;
    const checks = [
      [name.check(), nameRef],
      [color.check(), colorRef],
      [sender.check(), senderRef],
    ] as const;
    const first = checks.find(([problem]) => problem);
    if (first) {
      first[1].current?.focus();
      return;
    }
    setStatus("saving");
    setFormError(null);
    const outcome = await saveWorkspaceSettings(values);
    if (!outcome.ok) {
      setStatus("idle");
      setFormError(accountErrorMessage(outcome.error));
      return;
    }
    setSaved(values);
    name.field.onChange(values.name);
    color.field.onChange(values.brandColor ?? "");
    sender.field.onChange(values.senderName ?? "");
    setStatus("saved");
    router.refresh();
  };

  return (
    <SettingsCard
      title="Brand"
      description="How your company appears to guests: on review links, their link previews and the emails Squint sends for you."
      icon="layers"
      testId="workspace-brand-settings"
    >
      <form
        method="post"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={status === "saving"}
        className="flex flex-col gap-4"
      >
        <AuthField
          label="Workspace name"
          type="text"
          autoComplete="organization"
          name="name"
          inputRef={nameRef}
          hint={`Up to ${WORKSPACE_NAME_MAX_LENGTH} characters. Guests see it as the company inviting them.`}
          {...name.field}
          onChange={edited(name.field)}
          testId="workspace-name"
        />
        <div className="flex flex-col gap-1">
          <span className="text-body font-semibold">Workspace handle</span>
          {/* wrap-anywhere: a long handle can't push past a phone's edge. */}
          <span className="font-mono text-body text-ink wrap-anywhere" data-testid="workspace-slug">
            {slug}
          </span>
          <span className="text-meta text-muted">
            Set when the workspace was created. It can&apos;t be changed.
          </span>
        </div>
        <BrandColorField inputRef={colorRef} {...color.field} onChange={edited(color.field)} />
        <AuthField
          label="Email sender name"
          type="text"
          autoComplete="off"
          name="senderName"
          required={false}
          inputRef={senderRef}
          hint={`Optional, up to ${SENDER_NAME_MAX} characters. Guests get emails from this name, followed by "via Squint". Leave it blank to use the workspace name.`}
          {...sender.field}
          onChange={edited(sender.field)}
          testId="sender-name"
        />
        <InvitePreview
          name={name.value}
          color={normalizeBrandColor(color.value)}
          senderName={sender.value}
          logoSrc={logoSrc}
        />
        {/* The alerts take room only while they show. */}
        <div className="flex flex-col">
          <FormAlert className="has-[p]:mb-4" message={formError} testId="workspace-error" />
          <FormAlert
            className="has-[p]:mb-4"
            tone="info"
            message={status === "saved" ? "Workspace saved." : null}
            testId="workspace-saved"
          />
          <Button
            type="submit"
            aria-disabled={status === "saving" || unchanged || undefined}
            className="self-start max-sm:self-stretch"
            data-testid="save-workspace"
          >
            {status === "saving" ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
