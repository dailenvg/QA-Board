"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { requestJoin, type JoinError } from "@/lib/auth/join-client";
import { JOINED_PATH } from "@/lib/auth/next-path";
import type { JoinBrand } from "@/lib/workspace/members/join-page";
import { Button } from "../ui/Button";
import { AuthPanel } from "./AuthPanel";
import { FormAlert } from "./FormAlert";
import { JOIN_COPY } from "./join-copy";

const COPY = JOIN_COPY.join;

interface JoinConfirmProps {
  token: string;
  brand: JoinBrand;
  inviter: string | null;
  initialError: string | null;
  focusTitle: boolean;
  onRefused: (error: JoinError, retryAfterSeconds?: number) => string | null;
  footer: ReactNode;
}

/**
 * Signed in as the invited address, in no workspace yet (4b.6): one button
 * that joins. Opening the page never does: mail scanners open links too.
 * JSON once hydrated, a plain form post before that.
 */
export function JoinConfirm({
  token,
  brand,
  inviter,
  initialError,
  focusTitle,
  onRefused,
  footer,
}: JoinConfirmProps) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (joining) return;
    setJoining(true);
    setError(null);
    const outcome = await requestJoin(token);
    if (outcome.ok) {
      window.location.assign(JOINED_PATH);
      return;
    }
    setJoining(false);
    setError(onRefused(outcome.error, outcome.retryAfterSeconds));
  };

  return (
    <AuthPanel
      title={COPY.title(brand.workspace)}
      description={COPY.line(inviter, brand.workspace)}
      mood={joining ? "thinking" : error ? "surprised" : "happy"}
      brand={{ name: brand.workspace, color: brand.color, logoSrc: brand.logoSrc }}
      focusTitle={focusTitle}
      footer={footer}
    >
      <form
        method="post"
        action="/api/auth/join"
        onSubmit={(event) => void submit(event)}
        aria-busy={joining}
        className="flex flex-col gap-4"
        data-testid="join-confirm"
      >
        <input type="hidden" name="token" value={token} />
        <FormAlert message={error} testId="join-error" />
        <Button type="submit" aria-disabled={joining || undefined} data-testid="join-submit">
          {joining ? COPY.pending : COPY.button(brand.workspace)}
        </Button>
      </form>
    </AuthPanel>
  );
}
