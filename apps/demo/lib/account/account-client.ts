/**
 * The browser side of the account routes: requests, and what each answer
 * means for the settings forms. Never throws: a network failure is an outcome too.
 */

import { loginErrorMessage } from "../auth/auth-client";

export type AccountError =
  | "wrong-password"
  /** A workspace setting, from a member who doesn't own the workspace. */
  | "owner-only"
  /** Deleting the admin's account, which isn't done from the settings. */
  | "admin-account"
  /** Deleting an owner's account while others still work in the workspace. */
  | "owner-has-members"
  /** Deleting an account with the wrong workspace name or email typed. */
  | "confirm-mismatch"
  | "same-email"
  | "rate-limited"
  | "too-many-requests"
  | "invalid"
  | "signed-out"
  /** The request never reached Squint (offline, or the connection dropped). */
  | "offline"
  /** Squint answered, but with an error of its own. */
  | "failed";

export type AccountOutcome =
  { ok: true } | { ok: false; error: AccountError; retryAfterSeconds?: number };

export type ConfirmOutcome =
  { ok: true } | { ok: false; error: "expired" | "taken" | "offline" | "failed" };

/** The lock's length, when a 429 somehow arrives without Retry-After. */
const DEFAULT_RETRY_SECONDS = 15 * 60;

async function send(method: "POST" | "PATCH" | "DELETE", path: string, body: unknown) {
  try {
    return await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

async function errorCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : null;
}

async function outcomeOf(response: Response | null): Promise<AccountOutcome> {
  if (!response) return { ok: false, error: "offline" };
  if (response.ok) return { ok: true };
  switch (response.status) {
    case 400:
      return { ok: false, error: "invalid" };
    case 401:
      return { ok: false, error: "signed-out" };
    case 403: {
      const code = await errorCode(response);
      return code === "owner-only" || code === "admin-account"
        ? { ok: false, error: code }
        : { ok: false, error: "failed" };
    }
    case 409:
      return (await errorCode(response)) === "owner-has-members"
        ? { ok: false, error: "owner-has-members" }
        : { ok: false, error: "failed" };
    case 422: {
      const code = await errorCode(response);
      return code === "same-email" || code === "confirm-mismatch"
        ? { ok: false, error: code }
        : { ok: false, error: "wrong-password" };
    }
    case 429:
      if ((await errorCode(response)) === "too-many-requests") {
        return { ok: false, error: "too-many-requests" };
      }
      return {
        ok: false,
        error: "rate-limited",
        retryAfterSeconds: Number(response.headers.get("retry-after")) || DEFAULT_RETRY_SECONDS,
      };
    default:
      return { ok: false, error: "failed" };
  }
}

export async function saveDisplayName(name: string): Promise<AccountOutcome> {
  return outcomeOf(await send("PATCH", "/api/account/profile", { name }));
}

/** The workspace settings, as `workspaceSettingsSchema` takes them. */
export interface WorkspaceSettingsValues {
  name: string;
  brandColor: string | null;
  senderName: string | null;
}

/** Saves every workspace setting at once (the owner's only). */
export async function saveWorkspaceSettings(
  values: WorkspaceSettingsValues,
): Promise<AccountOutcome> {
  return outcomeOf(await send("PATCH", "/api/account/workspace", values));
}

/** On success this browser has a new session cookie; every other one is signed out. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AccountOutcome> {
  return outcomeOf(await send("POST", "/api/account/password", { currentPassword, newPassword }));
}

/** Succeeds the same whether or not another account has `newEmail`. */
export async function requestEmailChange(
  currentPassword: string,
  newEmail: string,
): Promise<AccountOutcome> {
  return outcomeOf(await send("POST", "/api/account/email", { currentPassword, newEmail }));
}

/** Ends every session of the account, this browser's included. */
export async function logOutEverywhere(): Promise<AccountOutcome> {
  return outcomeOf(await send("DELETE", "/api/account/sessions", {}));
}

/**
 * Deletes the account: `confirmText` is what the dialog asked for (the
 * workspace's name, or a member's email). On success every session has ended,
 * this browser's included.
 */
export async function deleteAccount(
  confirmText: string,
  currentPassword: string,
): Promise<AccountOutcome> {
  return outcomeOf(await send("DELETE", "/api/account", { confirmText, currentPassword }));
}

export async function confirmEmailChange(token: string): Promise<ConfirmOutcome> {
  const response = await send("POST", "/api/auth/email-change/confirm", { token });
  if (!response) return { ok: false, error: "offline" };
  if (response.ok) return { ok: true };
  if (response.status === 410) return { ok: false, error: "expired" };
  if (response.status === 409) return { ok: false, error: "taken" };
  return { ok: false, error: "failed" };
}

/** What a settings form says for a failed request. */
export function accountErrorMessage(error: AccountError, retryAfterSeconds = 0): string {
  switch (error) {
    case "wrong-password":
      return "That isn't your current password. Check it and try again.";
    case "owner-only":
      return "Only the workspace's owner can change its settings. Ask them to make the change.";
    case "same-email":
      return "That's already your email address.";
    case "admin-account":
      return "The admin account can't be deleted from here.";
    case "owner-has-members":
      return "Other people still work in this workspace. Make one of them its owner before you delete your account. Your Squint administrator can help.";
    case "confirm-mismatch":
      return "That doesn't match. Check what you typed and try again.";
    case "rate-limited":
      return loginErrorMessage("rate-limited", retryAfterSeconds);
    case "too-many-requests":
      return "You've asked for 3 email changes in the last hour. Try again later.";
    case "invalid":
      return "Check the fields above and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again to make changes.";
    case "offline":
      return "Couldn't reach Squint. Check your connection and try again.";
    case "failed":
      return "Something went wrong on our side. Try again in a moment.";
  }
}

/** Where each image goes: the user's avatar, or their workspace's logo. */
const IMAGE_PATHS = {
  avatar: "/api/account/avatar",
  logo: "/api/account/workspace/logo",
} as const;

export type ImageTarget = keyof typeof IMAGE_PATHS;

export type ImageError =
  | "too-large"
  | "wrong-kind"
  | "wrong-size"
  | "quota"
  | "rate-limited"
  | "owner-only"
  | "signed-out"
  | "offline"
  | "failed";

export type ImageOutcome =
  | { ok: true; version: string | null }
  | { ok: false; error: ImageError; retryAfterSeconds?: number };

const IMAGE_REFUSALS: ReadonlySet<string> = new Set([
  "too-large",
  "wrong-kind",
  "wrong-size",
  "quota",
  "owner-only",
]);

async function imageOutcomeOf(response: Response | null): Promise<ImageOutcome> {
  if (!response) return { ok: false, error: "offline" };
  if (response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const version =
      body && typeof body === "object" && "version" in body && typeof body.version === "string"
        ? body.version
        : null;
    return { ok: true, version };
  }
  if (response.status === 401) return { ok: false, error: "signed-out" };
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after")) || 60;
    return { ok: false, error: "rate-limited", retryAfterSeconds: retry };
  }
  const code = await errorCode(response);
  return code && IMAGE_REFUSALS.has(code)
    ? { ok: false, error: code as ImageError }
    : { ok: false, error: "failed" };
}

/** Uploads an image the browser prepared (`prepare-image.ts`); on success, its new `?v=`. */
export async function uploadImage(target: ImageTarget, image: Blob): Promise<ImageOutcome> {
  let response: Response | null;
  try {
    response = await fetch(IMAGE_PATHS[target], {
      method: "PUT",
      headers: { "content-type": image.type || "application/octet-stream" },
      body: image,
    });
  } catch {
    response = null;
  }
  return imageOutcomeOf(response);
}

export async function removeImage(target: ImageTarget): Promise<ImageOutcome> {
  return imageOutcomeOf(await send("DELETE", IMAGE_PATHS[target], {}));
}

/** What an uploader says for a failed upload or removal. */
export function imageErrorMessage(error: ImageError, retryAfterSeconds = 0): string {
  switch (error) {
    case "too-large":
      return "That image is still over 1 MB once resized. Try a simpler one.";
    case "wrong-kind":
      return "That file isn't an image Squint can use. Use a PNG, JPG or WebP.";
    case "wrong-size":
      return "That image's size isn't one Squint can use. Try another.";
    case "quota":
      return "Your workspace is out of storage. Free some up, then try again.";
    case "rate-limited":
      return `You've uploaded a lot of images in the last minute. Try again in ${Math.max(1, retryAfterSeconds)} seconds.`;
    case "owner-only":
      return accountErrorMessage("owner-only");
    case "signed-out":
    case "offline":
    case "failed":
      return accountErrorMessage(error);
  }
}
