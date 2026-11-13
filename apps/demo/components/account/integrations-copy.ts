import { accountErrorMessage } from "@/lib/account/account-client";
import { loginErrorMessage } from "@/lib/auth/auth-client";
import type { ClickUpRequestError } from "@/lib/integrations/clickup/settings-client";

/** Every line the Integrations card shows, in one place for review. */

export const INTEGRATIONS_COPY = {
  title: "Integrations",
  description: "Connect the tools your team already works in.",
  clickUp: {
    name: "ClickUp",
    unavailable:
      "ClickUp can't be connected on this site right now. If your team needs it, ask your Squint admin.",
    disconnected:
      "Connect ClickUp with your personal API token so Squint can post to a ClickUp workspace.",
    memberOnly:
      "Only the workspace's owner can connect or disconnect ClickUp. Ask them if something needs changing.",
    token: {
      label: "ClickUp personal API token",
      hint: "In ClickUp, click your avatar, then Settings, then Apps, and copy (or generate) your API Token. It starts with pk_.",
      shape:
        "That doesn't look like a ClickUp API token, which starts with pk_. Copy the whole token from ClickUp and paste it again.",
      required: "Paste your ClickUp personal API token.",
    },
    connect: "Connect ClickUp",
    connecting: "Connecting…",
    choose: {
      legend: "This token has access to more than one ClickUp workspace. Pick the one to connect.",
      pickFirst: "Pick a ClickUp workspace first.",
      submit: "Connect workspace",
    },
    /** "Connected to Acme Design". */
    connectedTo: "Connected to",
    /** "Posts appear as Ana Ruiz". */
    postsAs: "Posts appear as",
    /** "Connected by Ana on Nov 12, 2026"; without a name, "Connected on …". */
    connectedBy: (name: string | null) => (name ? `Connected by ${name} on` : "Connected on"),
    disconnect: "Disconnect",
    disconnecting: "Disconnecting…",
    confirmDisconnect: (team: string) =>
      `Disconnect ClickUp? Squint will stop posting to ${team} and delete its copy of the token. The token still works in ClickUp until you regenerate it there, under Settings, then Apps.`,
    cancel: "Cancel",
    connected: "ClickUp is connected.",
    disconnectedNotice:
      "ClickUp is disconnected. To turn the token off too, regenerate it in ClickUp under Settings, then Apps.",
  },
} as const;

/** A line the card shows above the ClickUp row: how something went. */
export interface ClickUpNotice {
  tone: "info" | "error";
  message: string;
}

/** What the card says when one of its requests fails. */
export function clickUpErrorMessage(error: ClickUpRequestError, retryAfterSeconds = 0): string {
  switch (error) {
    case "refused":
      return "ClickUp didn't accept that token. Check that you copied all of it, or regenerate it in ClickUp and paste the new one.";
    case "no-workspace":
      return "That token doesn't have access to any ClickUp workspace. Use a token from a ClickUp account in the workspace you want to connect.";
    case "unknown-team":
      return "This token no longer has access to that ClickUp workspace. Pick another one.";
    case "unreachable":
      return "ClickUp didn't answer just now. Try again in a moment.";
    case "unavailable":
      return INTEGRATIONS_COPY.clickUp.unavailable;
    case "owner-only":
      return INTEGRATIONS_COPY.clickUp.memberOnly;
    case "rate-limited":
      return loginErrorMessage("rate-limited", retryAfterSeconds);
    case "signed-out":
    case "offline":
    case "failed":
      return accountErrorMessage(error);
  }
}
