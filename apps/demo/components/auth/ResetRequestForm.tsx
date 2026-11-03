"use client";

import { useRef, useState, type FormEvent } from "react";
import { requestResetEmail } from "@/lib/auth/auth-client";
import { emailError } from "@/lib/auth/field-rules";
import { Button } from "../ui/Button";
import { AuthField } from "./AuthField";
import { AuthPanel } from "./AuthPanel";
import { FormAlert } from "./FormAlert";
import { TextLink } from "./TextLink";

type Status = "idle" | "sending" | "sent";

const BACK = <TextLink href="/login">Back to sign in</TextLink>;

/**
 * Asks for a reset link. Says the same thing whether or not the email has an
 * account, so the form can't be used to find out who has one.
 */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status !== "idle") return;
    const problem = emailError(email);
    setError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    setStatus("sending");
    setFormError(null);
    if (await requestResetEmail(email)) {
      setStatus("sent");
      return;
    }
    setStatus("idle");
    setFormError("Couldn't send the request. Check your connection and try again.");
  };

  if (status === "sent") {
    return (
      <AuthPanel
        title="Check your email"
        description={
          <p data-testid="reset-sent">
            If <strong className="font-semibold text-ink">{email.trim()}</strong> has a Squint
            account, a link to choose a new password is on its way. It works once, for one hour.
          </p>
        }
        mood="happy"
        footer={BACK}
      >
        <Button variant="secondary" onClick={() => setStatus("idle")}>
          Use a different email
        </Button>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Reset your password"
      description="Enter your account's email and we'll send you a link to choose a new password."
      mood={status === "sending" ? "thinking" : formError ? "surprised" : "idle"}
      footer={BACK}
    >
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={status === "sending"}
        className="flex flex-col gap-5"
        data-testid="reset-request-form"
      >
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          inputRef={inputRef}
          value={email}
          error={error}
          onChange={(value) => {
            setEmail(value);
            if (error) setError(emailError(value));
          }}
          onBlur={() => setError(emailError(email))}
          testId="reset-email"
        />
        <FormAlert message={formError} />
        <Button type="submit" aria-disabled={status === "sending" || undefined}>
          {status === "sending" ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthPanel>
  );
}
