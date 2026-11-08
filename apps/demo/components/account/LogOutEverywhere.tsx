"use client";

import { useState } from "react";
import { accountErrorMessage, logOutEverywhere } from "@/lib/account/account-client";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";
import { SettingsCard } from "./SettingsCard";

/** Where the browser goes once every session has ended, this one's included. */
const SIGNED_OUT_HREF = "/login?signed-out=everywhere";

/** Ends every session of the account, after a confirm, then goes to sign in. */
export function LogOutEverywhere() {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setConfirming(false);
    setPending(true);
    setError(null);
    const outcome = await logOutEverywhere();
    if (outcome.ok) {
      // A full page load, not a client navigation: nothing of the ended session carries over.
      window.location.assign(SIGNED_OUT_HREF);
      return;
    }
    setPending(false);
    setError(accountErrorMessage(outcome.error));
  };

  return (
    <SettingsCard
      title="Sessions"
      description="Still signed in on a shared computer, or somewhere you don't expect? Sign out of Squint on every browser and device, this one included."
      icon="logOut"
      testId="sessions-settings"
    >
      <div className="flex flex-col">
        <FormAlert message={error} testId="sessions-error" className="has-[p]:mb-4" />
        <Button
          variant="secondary"
          onClick={() => {
            if (!pending) setConfirming(true);
          }}
          aria-disabled={pending || undefined}
          className="self-start max-sm:self-stretch"
          data-testid="log-out-everywhere"
        >
          <Icon name="logOut" className="size-5" />
          {pending ? "Logging out…" : "Log out everywhere"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Log out everywhere?"
        description="This signs you out on every browser and device, this one included. You'll need your password to sign in again."
        confirmLabel="Log out everywhere"
        onConfirm={() => void run()}
        onClose={() => setConfirming(false)}
      />
    </SettingsCard>
  );
}
