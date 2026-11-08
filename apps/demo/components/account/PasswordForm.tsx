"use client";

import { useRef, useState, type FormEvent } from "react";
import { accountErrorMessage, changePassword } from "@/lib/account/account-client";
import { currentPasswordError } from "@/lib/account/field-rules";
import {
  confirmPasswordError,
  newPasswordError,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/field-rules";
import { AuthField } from "../auth/AuthField";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { SettingsCard } from "./SettingsCard";
import { useCheckedField } from "./use-checked-field";

/**
 * Change the password: the current one, then the new one twice. Saving signs
 * out every other device; this one stays signed in.
 */
export function PasswordForm({ email }: { email: string }) {
  const current = useCheckedField(currentPasswordError);
  const next = useCheckedField(newPasswordError);
  const confirm = useCheckedField((value) => confirmPasswordError(next.value, value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const checks = [
      [current.check(), currentRef],
      [next.check(), nextRef],
      [confirm.check(), confirmRef],
    ] as const;
    const first = checks.find(([problem]) => problem);
    if (first) {
      first[1].current?.focus();
      return;
    }
    setSaving(true);
    setSaved(false);
    setFormError(null);
    const outcome = await changePassword(current.value, next.value);
    setSaving(false);
    if (outcome.ok) {
      setSaved(true);
      current.clear();
      next.clear();
      confirm.clear();
      return;
    }
    if (outcome.error === "wrong-password") {
      current.setError(accountErrorMessage(outcome.error));
      currentRef.current?.focus();
    } else {
      setFormError(accountErrorMessage(outcome.error, outcome.retryAfterSeconds));
    }
  };

  return (
    <SettingsCard
      title="Password"
      description="Changing it signs you out on every other device. This one stays signed in."
      icon="lock"
      testId="password-settings"
    >
      <form
        method="post"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={saving}
        className="flex flex-col gap-4"
      >
        {/* For password managers: which account the new password belongs to. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <AuthField
          label="Current password"
          type="password"
          autoComplete="current-password"
          name="currentPassword"
          inputRef={currentRef}
          {...current.field}
          testId="current-password"
        />
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          name="newPassword"
          inputRef={nextRef}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          {...next.field}
          onChange={(value) => {
            next.field.onChange(value);
            setSaved(false);
          }}
          testId="new-password"
        />
        <AuthField
          label="New password, again"
          type="password"
          autoComplete="new-password"
          name="confirmPassword"
          inputRef={confirmRef}
          {...confirm.field}
          testId="confirm-password"
        />
        {/* The alerts take room only while they show. */}
        <div className="flex flex-col">
          <FormAlert className="has-[p]:mb-4" message={formError} testId="password-error" />
          <FormAlert
            className="has-[p]:mb-4"
            tone="info"
            message={saved ? "Password changed. Your other devices are signed out." : null}
            testId="password-saved"
          />
          <Button
            type="submit"
            aria-disabled={saving || undefined}
            className="self-start max-sm:self-stretch"
            data-testid="change-password"
          >
            {saving ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
