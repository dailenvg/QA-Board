import { PASSWORD_MIN_LENGTH } from "@/lib/auth/field-rules";

/**
 * Every line an invite's page (`/join/<token>`, 4.2, 4b.6) shows, in one
 * place for review. `{Owner}` falls back to "the workspace's owner"
 * (`ownerLabel`) before the caller gets here.
 */

/** "{Inviter} invited you…", or, without the inviter's name, someone at the workspace. */
const invitedBy = (inviter: string | null, workspace: string) =>
  `${inviter?.trim() || `Someone at ${workspace}`} invited you to review with them.`;

const askForNew = (owner: string, workspace: string) =>
  `Ask ${owner} at ${workspace} for a new one.`;

export const JOIN_COPY = {
  newPerson: {
    title: (workspace: string) => `Join ${workspace} on Squint`,
    line: invitedBy,
    email: "Email",
    name: "Name",
    nameHint: "Shown with your comments.",
    password: "Password",
    passwordHint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
    again: "Password, again",
  },
  join: {
    title: (workspace: string) => `Join ${workspace}`,
    line: invitedBy,
    button: (workspace: string) => `Join ${workspace}`,
    pending: "Joining…",
  },
  signIn: {
    title: (workspace: string) => `Sign in to join ${workspace}`,
    line: (email: string) => `This invite is for ${email}.`,
    button: "Sign in",
    forgot: "Forgot your password?",
  },
  someoneElse: {
    title: "This invite is for someone else",
    line: (signedInAs: string, email: string) =>
      `You're signed in as ${signedInAs}, but this invite is for ${email}.`,
    signOut: "Sign out and continue",
    stay: "Stay signed in",
  },
  closing: {
    title: "This email can't join right now",
    line: (email: string, owner: string) =>
      `The Squint account for ${email} is being deleted, so ask ${owner} to invite a different address.`,
  },
  inAnother: {
    title: (other: string) => `You're already in ${other}`,
    line: "For now, each person can be in only one workspace.",
    button: (other: string) => `Go to ${other}`,
  },
  expired: { title: "This invite has expired", line: askForNew },
  cancelled: { title: "This invite was cancelled", line: askForNew },
  used: {
    title: "This invite has been used",
    line: (owner: string, workspace: string) =>
      `If that wasn't you, ask ${owner} at ${workspace} for a new one.`,
  },
  full: {
    title: (workspace: string) => `${workspace} is full right now`,
    line: (owner: string) => `Ask ${owner} to free a seat, then open this link again.`,
  },
  unknown: {
    title: "This invite link doesn't work",
    line: "Check that you copied all of it, or ask for a new one.",
    button: "Go to sign in",
  },
  unavailable: {
    title: "Couldn't open this invite",
    line: "Something went wrong on our side. Try again in a moment.",
    button: "Try again",
  },
  signInButton: "Sign in",
  back: "Back to sign in",
  app: "Go to Squint",
} as const;
