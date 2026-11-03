"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { loginErrorMessage, requestLogin } from "@/lib/auth/auth-client";
import { emailError, passwordError } from "@/lib/auth/field-rules";
import { withWelcome } from "@/lib/auth/next-path";
import type { Mood } from "../brand/mascot/moods";
import { Button } from "../ui/Button";
import { AuthField } from "./AuthField";
import { AuthPanel } from "./AuthPanel";
import { FormAlert } from "./FormAlert";
import { TextLink } from "./TextLink";

interface LoginFormProps {
  /** Where to go once signed in (already checked to be on this site). */
  next: string;
  /** Arrived from a completed password reset. */
  passwordChanged: boolean;
}

type Status = "idle" | "submitting" | "signed-in";

interface FieldErrors {
  email: string | null;
  password: string | null;
}

const NO_ERRORS: FieldErrors = { email: null, password: null };

function moodFor(status: Status, failed: boolean): Mood {
  if (status === "signed-in") return "happy";
  if (status === "submitting") return "thinking";
  return failed ? "surprised" : "idle";
}

/** Email and password, checked on blur and on submit; the server's answer shows above the button. */
export function LoginForm({ next, passwordChanged }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const busy = status !== "idle";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = { email: emailError(email), password: passwordError(password) };
    setErrors(found);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setStatus("submitting");
    setFormError(null);
    const outcome = await requestLogin(email, password);
    if (outcome.ok) {
      setStatus("signed-in");
      router.replace(withWelcome(next));
      return;
    }
    setStatus("idle");
    setFormError(loginErrorMessage(outcome.error, outcome.retryAfterSeconds));
    if (outcome.error === "invalid-credentials") {
      setPassword("");
      passwordRef.current?.focus();
    }
  };

  return (
    <AuthPanel
      title="Sign in to Squint"
      description="Use the email and password your workspace was set up with."
      mood={moodFor(status, formError !== null)}
      footer={<TextLink href="/reset">Forgot your password?</TextLink>}
    >
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        aria-busy={busy}
        className="flex flex-col gap-5"
        data-testid="login-form"
      >
        <FormAlert
          tone="info"
          message={passwordChanged ? "Password changed. Sign in with your new password." : null}
        />
        <AuthField
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          inputRef={emailRef}
          value={email}
          error={errors.email}
          onChange={(value) => {
            setEmail(value);
            if (errors.email) setErrors((current) => ({ ...current, email: emailError(value) }));
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              // Leaving it empty (say, for Forgot your password?) isn't a mistake yet.
              email: email ? emailError(email) : current.email,
            }))
          }
          testId="login-email"
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          inputRef={passwordRef}
          value={password}
          error={errors.password}
          onChange={(value) => {
            setPassword(value);
            if (errors.password) {
              setErrors((current) => ({ ...current, password: passwordError(value) }));
            }
          }}
          onBlur={() =>
            setErrors((current) => ({
              ...current,
              // Leaving it empty to go back to the email isn't a mistake yet.
              password: password ? passwordError(password) : current.password,
            }))
          }
          testId="login-password"
        />
        <FormAlert message={formError} testId="login-error" />
        <Button type="submit" aria-disabled={busy || undefined} data-testid="login-submit">
          {status === "submitting"
            ? "Signing in…"
            : status === "signed-in"
              ? "Signed in"
              : "Sign in"}
        </Button>
      </form>
    </AuthPanel>
  );
}
