"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { setNewPassword } from "@/lib/auth/auth-client";
import {
  confirmPasswordError,
  newPasswordError,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/field-rules";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { AuthField } from "./AuthField";
import { AuthPanel } from "./AuthPanel";
import { FormAlert } from "./FormAlert";
import { TextLink } from "./TextLink";

interface ResetPasswordFormProps {
  token: string;
  /** Whether the link could still be used when the page loaded. */
  usable: boolean;
}

interface FieldErrors {
  password: string | null;
  confirm: string | null;
}

const BACK = <TextLink href="/login">Back to sign in</TextLink>;

/** `afterSubmit`: it replaced the form just submitted, so focus moves to its title. */
function ExpiredLink({ afterSubmit }: { afterSubmit: boolean }) {
  return (
    <AuthPanel
      title="This link has expired"
      description="Reset links work once, for one hour. Ask for a new one and use it from the newest email."
      mood="thinking"
      footer={BACK}
      focusTitle={afterSubmit}
    >
      <ButtonLink href="/reset" testId="reset-again">
        Send a new link
      </ButtonLink>
    </AuthPanel>
  );
}

/** Choose a new password from an emailed link; then on to sign in with it. */
export function ResetPasswordForm({ token, usable }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({ password: null, confirm: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [expired, setExpired] = useState(!usable);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (expired) return <ExpiredLink afterSubmit={usable} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status !== "idle") return;
    const found = {
      password: newPasswordError(password),
      confirm: confirmPasswordError(password, confirm),
    };
    setErrors(found);
    if (found.password || found.confirm) {
      (found.password ? passwordRef : confirmRef).current?.focus();
      return;
    }
    setStatus("saving");
    setFormError(null);
    const outcome = await setNewPassword(token, password);
    if (outcome.ok) {
      setStatus("saved");
      router.replace("/login?reset=done");
      return;
    }
    setStatus("idle");
    if (outcome.error === "expired") setExpired(true);
    else setFormError("Couldn't save the new password. Check your connection and try again.");
  };

  return (
    <AuthPanel
      title="Choose a new password"
      description="Saving it signs you out on every device. Then sign in with the new one."
      mood={status === "idle" ? (formError ? "surprised" : "idle") : "thinking"}
      footer={BACK}
    >
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={status !== "idle"}
        className="flex flex-col gap-5"
        data-testid="reset-password-form"
      >
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          inputRef={passwordRef}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          value={password}
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            if (errors.password) {
              setErrors((current) => ({ ...current, password: newPasswordError(value) }));
            }
          }}
          onBlur={() =>
            setErrors((current) => ({ ...current, password: newPasswordError(password) }))
          }
        />
        <AuthField
          label="New password, again"
          type="password"
          autoComplete="new-password"
          inputRef={confirmRef}
          value={confirm}
          error={errors.confirm}
          onChange={(value) => {
            setConfirm(value);
            if (errors.confirm) {
              setErrors((current) => ({
                ...current,
                confirm: confirmPasswordError(password, value),
              }));
            }
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              confirm: confirm ? confirmPasswordError(password, confirm) : current.confirm,
            }))
          }
        />
        <FormAlert message={formError} />
        <Button type="submit" aria-disabled={status !== "idle" || undefined}>
          {status === "idle" ? "Save new password" : "Saving…"}
        </Button>
      </form>
    </AuthPanel>
  );
}
