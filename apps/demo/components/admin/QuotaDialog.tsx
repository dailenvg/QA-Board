"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { formatBytes } from "@/lib/account/storage-level";
import { parseQuotaGb, quotaGb } from "@/lib/admin/quota";
import type { AdminWorkspace } from "@/lib/admin/workspaces";
import type { AdminActionError } from "@/lib/admin/workspaces-client";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldError } from "../ui/FieldError";
import { FIELD_CLASS } from "../ui/field-styles";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.workspaces.quota;

interface QuotaDialogProps {
  open: boolean;
  workspace: AdminWorkspace;
  /** Saves the quota; resolves with why it didn't work, or null once it did (and closes). */
  onSave: (quotaBytes: number) => Promise<AdminActionError | null>;
  onClose: () => void;
}

/**
 * Edits a workspace's storage quota in GB. Checked on blur and on save. A
 * quota under what it stores now is allowed and said plainly before saving.
 * Stays up while it's saved; a failure shows in it, and saving tries again.
 */
export function QuotaDialog({ open, workspace, onSave, onClose }: QuotaDialogProps) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={COPY.title(workspace.name)}
      description={COPY.description(formatBytes(workspace.usedBytes))}
      size="sm"
      dismissible={!saving}
      fitKeyboard
      testId="quota-dialog"
    >
      <QuotaForm
        key={workspace.id}
        workspace={workspace}
        saving={saving}
        onSave={async (bytes) => {
          setSaving(true);
          const error = await onSave(bytes);
          setSaving(false);
          return error;
        }}
        onClose={onClose}
      />
    </Dialog>
  );
}

interface QuotaFormProps {
  workspace: AdminWorkspace;
  saving: boolean;
  onSave: (quotaBytes: number) => Promise<AdminActionError | null>;
  onClose: () => void;
}

function QuotaForm({ workspace, saving, onSave, onClose }: QuotaFormProps) {
  const [value, setValue] = useState(String(quotaGb(workspace.quotaBytes)));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const bytes = parseQuotaGb(value);
  const below = bytes !== null && bytes < workspace.usedBytes;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (bytes === null) {
      setFieldError(COPY.invalid);
      input.current?.focus();
      return;
    }
    setFormError(null);
    const error = await onSave(bytes);
    if (error) setFormError(ADMIN_COPY.workspaces.errors[error]);
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={saving || undefined}
      className="flex flex-col"
    >
      <div className="mb-5">
        <label htmlFor={inputId} className="mb-2 block text-body font-semibold">
          {COPY.label}
        </label>
        <input
          ref={input}
          id={inputId}
          data-autofocus
          inputMode="decimal"
          autoComplete="off"
          value={value}
          readOnly={saving}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={errorId}
          data-testid="quota-input"
          onChange={(event) => {
            setValue(event.target.value);
            if (fieldError) setFieldError(null);
          }}
          onBlur={() => setFieldError(parseQuotaGb(value) === null ? COPY.invalid : null)}
          onFocus={(event) => event.currentTarget.select()}
          className={FIELD_CLASS}
        />
        <FieldError id={errorId} message={fieldError} />
      </div>
      <FormAlert
        message={below ? COPY.below(formatBytes(workspace.usedBytes)) : null}
        tone="note"
        testId="quota-below"
        className="has-[p]:mb-4"
      />
      <FormAlert message={formError} testId="quota-error" className="has-[p]:mb-4" />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          onClick={saving ? undefined : onClose}
          aria-disabled={saving || undefined}
        >
          {COPY.cancel}
        </Button>
        <Button type="submit" aria-disabled={saving || undefined} data-testid="quota-save">
          {saving ? COPY.saving : COPY.save}
        </Button>
      </div>
    </form>
  );
}
