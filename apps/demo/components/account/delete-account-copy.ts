import { ACCOUNT_DELETION_GRACE_DAYS } from "@/lib/account/field-rules";

/**
 * Every line the Delete account card and its dialog show, in one place for
 * review. The route's error messages are in `account-client.ts`, the sign-in
 * page's notice in `form-flags.ts`, and the email in `account-email.ts`.
 */

const DAYS = ACCOUNT_DELETION_GRACE_DAYS;

export const DELETE_ACCOUNT_COPY = {
  title: "Delete account",
  description: {
    /** An owner's: the workspace goes with the account. */
    workspace: (workspace: string) =>
      `Deletes your account and the ${workspace} workspace, with its projects, comments and review links. The links stop working right away. Until it's all deleted for good in ${DAYS} days, your Squint admin can restore it.`,
    /** A member's: the workspace stays. */
    email: `Deletes your account and signs you out everywhere. Your comments stay in the workspace, under your name. After ${DAYS} days your account is deleted for good. Until then, your Squint admin can restore it.`,
  },
  open: "Delete account",
  dialog: {
    title: "Delete your account?",
    description: {
      workspace: (workspace: string) =>
        `You'll be signed out everywhere, and nobody can open ${workspace} or its review links. Your Squint admin can undo this within ${DAYS} days.`,
      email: `You'll be signed out everywhere and won't be able to sign in. Your Squint admin can undo this within ${DAYS} days.`,
    },
    /** The field's label: "Type Acme to confirm". */
    confirmLabel: (text: string) => `Type ${text} to confirm`,
    confirmHint: {
      workspace: "Your workspace's name, exactly as shown. Capital letters count.",
      email: "The email you sign in with.",
    },
    confirmEmpty: (text: string) => `Type ${text} to confirm.`,
    confirmMismatch: (text: string) => `That doesn't match. Type ${text} to confirm.`,
    password: "Current password",
    cancel: "Cancel",
    submit: "Delete account",
    /** Next to the greyed-out button, until both fields are filled in: "Type Acme and…". */
    submitHint: (text: string) => `Type ${text} and your current password to delete your account.`,
    submitting: "Deleting…",
  },
} as const;
