"use client";

import { useRef, useState, type FormEvent } from "react";
import { accountErrorMessage, requestEmailChange } from "@/lib/account/account-client";
import { currentPasswordError, isCurrentEmail } from "@/lib/account/field-rules";
import { emailError, normalizeEmail } from "@/lib/auth/field-rules";
import { AuthField } from "../auth/AuthField";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { SettingsCard } from "./SettingsCard";
import { useCheckedField } from "./use-checked-field";

/** The pending change's notice. It can't say whether the address is free: that stays private. */
function sentNotice(newEmail: string, currentEmail: string): string {
  return `If no other account uses ${newEmail}, a link to confirm the change is on its way there. It works once, for one hour. Until you use it, sign in with ${currentEmail}.`;
}

/**
 * Change the sign-in email: the new address and the current password. The
 * change waits for the link mailed to the new address.
 */
export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const newEmail = useCheckedField((value) =>
    isCurrentEmail(value, currentEmail) ? "That's already your email address." : emailError(value),
  );
  const password = useCheckedField(currentPasswordError);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const emailProblem = newEmail.check();
    const passwordProblem = password.check();
    if (emailProblem || passwordProblem) {
      (emailProblem ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSending(true);
    setFormError(null);
    setSentTo(null);
    const outcome = await requestEmailChange(password.value, newEmail.value);
    setSending(false);
    if (outcome.ok) {
      setSentTo(normalizeEmail(newEmail.value));
      newEmail.clear();
      password.clear();
      return;
    }
    if (outcome.error === "wrong-password") {
      password.setError(accountErrorMessage(outcome.error));
      passwordRef.current?.focus();
    } else if (outcome.error === "same-email") {
      newEmail.setError(accountErrorMessage(outcome.error));
      emailRef.current?.focus();
    } else {
      setFormError(accountErrorMessage(outcome.error, outcome.retryAfterSeconds));
    }
  };

  return (
    <SettingsCard
      title="Email"
      description={
        <>
          You sign in with <strong className="font-semibold text-ink">{currentEmail}</strong>. To
          change it, we&apos;ll send a link to the new address.
        </>
      }
      icon="mail"
      testId="email-settings"
    >
      <form
        method="post"
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={sending}
        className="flex flex-col gap-4"
      >
        <AuthField
          label="New email"
          type="email"
          autoComplete="email"
          name="newEmail"
          inputRef={emailRef}
          {...newEmail.field}
          testId="new-email"
        />
        <AuthField
          label="Current password"
          type="password"
          autoComplete="current-password"
          name="currentPassword"
          inputRef={passwordRef}
          hint="So we know it's you."
          {...password.field}
          testId="email-current-password"
        />
        {/* The alerts take room only while they show. */}
        <div className="flex flex-col">
          <FormAlert className="has-[p]:mb-4" message={formError} testId="email-error" />
          <FormAlert
            className="has-[p]:mb-4"
            tone="info"
            message={sentTo ? sentNotice(sentTo, currentEmail) : null}
            testId="email-sent"
          />
          <Button
            type="submit"
            aria-disabled={sending || undefined}
            className="self-start max-sm:self-stretch"
            data-testid="send-email-link"
          >
            {sending ? "Sending…" : "Send confirmation link"}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
