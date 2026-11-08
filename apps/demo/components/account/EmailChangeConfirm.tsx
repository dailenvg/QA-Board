"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { confirmEmailChange } from "@/lib/account/account-client";
import { emailChangeFlagMessage } from "@/lib/auth/form-flags";
import { ACCOUNT_PROFILE_HREF, EMAIL_CHANGED_HREF } from "@/lib/routes";
import { AuthPanel } from "../auth/AuthPanel";
import { FormAlert } from "../auth/FormAlert";
import { TextLink } from "../auth/TextLink";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";

interface EmailChangeConfirmProps {
  token: string;
  /** Whether the link could still be used when the page loaded. */
  usable: boolean;
  /** A refused confirm that was posted before the page hydrated (from `?error=`). */
  initialError: string | null;
}

type Status = "idle" | "confirming" | "done";

const BACK = <TextLink href="/login">Back to sign in</TextLink>;

/** `afterSubmit`: it replaced the button just pressed, so focus moves to its title. */
function ExpiredLink({ afterSubmit }: { afterSubmit: boolean }) {
  return (
    <AuthPanel
      title="This link has expired"
      description="Email change links work once, for one hour. Sign in and ask for a new one from your account settings."
      mood="thinking"
      footer={BACK}
      focusTitle={afterSubmit}
    >
      <ButtonLink href={ACCOUNT_PROFILE_HREF} testId="email-change-again">
        Go to account settings
      </ButtonLink>
    </AuthPanel>
  );
}

/**
 * The emailed link's page. Opening it changes nothing (mail scanners open
 * links too); the button posts the confirm. Then on to sign in, with the new address.
 */
export function EmailChangeConfirm({ token, usable, initialError }: EmailChangeConfirmProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(initialError);
  const [expired, setExpired] = useState(!usable);

  if (expired) return <ExpiredLink afterSubmit={usable} />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status !== "idle") return;
    setStatus("confirming");
    setFormError(null);
    const outcome = await confirmEmailChange(token);
    if (outcome.ok) {
      setStatus("done");
      router.replace(EMAIL_CHANGED_HREF);
      return;
    }
    setStatus("idle");
    if (outcome.error === "expired") setExpired(true);
    else if (outcome.error === "taken") setFormError(emailChangeFlagMessage("taken"));
    else setFormError("Couldn't confirm the change. Check your connection and try again.");
  };

  return (
    <AuthPanel
      title="Confirm your new email"
      description="Confirming signs you out on every device. Then sign in with the new address."
      mood={status === "idle" ? (formError ? "surprised" : "idle") : "thinking"}
      footer={BACK}
    >
      {/* method and action: a press before hydration posts the token, never into the address. */}
      <form
        method="post"
        action="/api/auth/email-change/confirm"
        onSubmit={(event) => void submit(event)}
        aria-busy={status !== "idle"}
        className="flex flex-col gap-5"
        data-testid="email-change-form"
      >
        <input type="hidden" name="token" value={token} />
        <FormAlert message={formError} testId="email-change-error" />
        <Button
          type="submit"
          aria-disabled={status !== "idle" || undefined}
          data-testid="confirm-email-change"
        >
          {status === "idle" ? "Confirm new email" : "Confirming…"}
        </Button>
      </form>
    </AuthPanel>
  );
}
