import type { AuditCategory } from "@/lib/admin/audit-category";
import { MAX_QUOTA_GB, MIN_QUOTA_GB } from "@/lib/admin/quota";
import type { AdminActionError } from "@/lib/admin/workspaces-client";
import type { MemberSwitch } from "@/lib/auth/permissions";
import { REVIEW_WINDOW_LABELS, type ReviewWindowChoice } from "@/lib/share/review-window";
import { MEMBERS_COPY } from "../account/members-copy";

/** Every line the admin panel shows, in one place for review. */

const number = new Intl.NumberFormat("en");

/** Switches by their short names ("review links, trash"), or "none". */
function switchNames(switches: readonly MemberSwitch[]): string {
  const names = switches.map((value) => MEMBERS_COPY.permissions.switches[value].short);
  return names.join(", ") || "none";
}

/** "1 entry", "1,204 entries". */
export function entryCount(n: number): string {
  return `${number.format(n)} ${n === 1 ? "entry" : "entries"}`;
}

/**
 * Each field name the app records, in plain words; a name not listed here
 * shows as recorded. The camelCase names are what the workspace and review
 * link settings write.
 */
export const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "name",
  email: "email",
  password: "password",
  avatar: "photo",
  sessions: "sessions",
  clickup: "ClickUp connection",
  logo: "logo",
  workspace: "workspace",
  membership: "membership",
  memberships: "memberships",
  permissions: "switches",
  invite: "invite",
  invites: "invitations",
  expires_at: "expiry date",
  revoked_at: "cancellation date",
  deleted_at: "date deleted",
  delete_after: "deletion date",
  removed_from: "removed from workspace",
  removed_permissions: "switches before removal",
  password_resets: "password reset links",
  email_changes: "email change links",
  seat_limit: "seat limit",
  storage_quota_bytes: "storage quota",
  suspended_at: "suspension",
  archived_at: "archive",
  brandColor: "brand color",
  senderName: "email sender name",
  reviewWindow: "review window",
  clientName: "client name",
  "archive-expired": "archive period ended",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export const ADMIN_COPY = {
  title: "Admin",
  /** In the account settings, for the admin: back to the panel. */
  backToAdmin: "Back to admin",
  summary: "Everything across Squint's workspaces.",
  nav: "Admin",
  unavailable: {
    description: "This page couldn't be loaded.",
    body: "Squint couldn't read it just now. Nothing has changed. Try again in a moment.",
    retry: "Try again",
    retrying: "Trying again…",
  },
  overview: {
    loading: "Loading the overview…",
    stats: "Across Squint",
    counts: {
      workspaces: { label: "Workspaces", note: "Including any due for deletion" },
      users: { label: "Accounts", note: "Accounts that can sign in" },
      projects: { label: "Projects", note: "Not counting the trash" },
      comments: { label: "Comments", note: "On projects outside the trash" },
      activeShares: { label: "Live review links", note: "Clients can open them now" },
      storageBytes: { label: "Storage", note: "Files across every workspace" },
    },
    activity: {
      title: "Activity",
      description:
        "What the audit log recorded each day for the last 30 days, in UTC. Comments and uploads aren't in the log.",
      /** "48 entries in the last 30 days". */
      total: (n: number) => `${entryCount(n)} in the last 30 days`,
      /** The chart's name for screen readers. */
      chart: (what: string, n: number, peak: string | null) =>
        peak
          ? `${what}: ${entryCount(n)} in the last 30 days, most on ${peak}.`
          : `${what}: nothing in the last 30 days.`,
      allLabel: "All activity",
      byCategory: "By kind",
      today: "Today",
      emptyTitle: "Nothing recorded lately",
      emptyBody:
        "Changes to accounts, workspaces, people and review links show up here as they happen.",
    },
  },
  workspaces: {
    title: "Workspaces",
    description:
      "Every workspace, its owner and how much it stores. Last activity is the latest project change, comment, or change by its people. Dates are in UTC.",
    loading: "Loading the workspaces…",
    columns: {
      workspace: "Workspace",
      owner: "Owner",
      members: "Members",
      projects: "Projects",
      storage: "Storage",
      lastActivity: "Last activity",
      status: "Status",
      actions: "Actions",
    },
    noOwner: "No owner",
    noActivity: "None yet",
    /** After the size used: "1.2 GB of 5 GB". */
    ofQuota: (quota: string) => `of ${quota}`,
    overQuota: "Over quota",
    status: {
      active: "Active",
      suspended: "Suspended",
      deleting: "Scheduled for deletion",
    },
    /** The row's menu, for screen readers: "Actions for Acme". */
    actions: (name: string) => `Actions for ${name}`,
    menu: {
      quota: "Edit storage quota",
      reset: "Reset owner password",
      /** In place of `reset`, unavailable, when the owner's account is deleted or there's none. */
      resetNoOwner: "Can't reset: no active owner",
      suspend: "Suspend",
      unsuspend: "Lift suspension",
      archive: "Archive",
      working: "Working…",
    },
    emptyTitle: "No workspaces yet",
    emptyBody: "Workspaces show up here once they're set up.",
    archived: {
      title: "Archived",
      description:
        "Locked, with everything kept and no deletion scheduled. Unarchive one to open it again as it was.",
      emptyTitle: "Nothing archived",
      emptyBody: "Archived workspaces show up here.",
      /** "Archived Nov 7, 2026". */
      on: (date: string) => `Archived ${date}`,
      unarchive: "Unarchive",
      unarchiving: "Unarchiving…",
      /** The button for screen readers: "Unarchive Acme". */
      unarchiveLabel: (name: string) => `Unarchive ${name}`,
    },
    quota: {
      title: (name: string) => `Storage quota for ${name}`,
      description: (used: string) => `It stores ${used} now.`,
      label: "Quota in GB",
      invalid: `Enter a number of GB from ${MIN_QUOTA_GB} to ${number.format(MAX_QUOTA_GB)}, with at most one decimal.`,
      /** The new quota is under what it stores: allowed, and said plainly. */
      below: (used: string) =>
        `That's less than the ${used} it stores now. Uploads stop until it's under the quota again. Nothing is deleted.`,
      cancel: "Cancel",
      save: "Save quota",
      saving: "Saving…",
      saved: (name: string) => `Saved the storage quota for ${name}.`,
    },
    reset: {
      title: "Reset the owner's password",
      /** Before the link is made. */
      description: (email: string) =>
        `Make a link that lets ${email} set a new password. It's shown once, here, and works once within an hour. Nothing is emailed: send it to them yourself.`,
      cancel: "Cancel",
      confirm: "Make reset link",
      pending: "Making link…",
      /** Once it's made: "Works once, until 15:05 UTC. Copy it now: it won't be shown again." */
      ready: (time: string) => `Works once, until ${time}. Copy it now: it won't be shown again.`,
      label: "Reset link",
      copy: "Copy link",
      copied: "Copied",
      copyFailed: "Couldn't copy the link. Select it and copy it yourself.",
      done: "Done",
    },
    suspend: {
      title: (name: string) => `Suspend ${name}?`,
      points: [
        "Its people can't open it. Anyone not in another workspace is signed out and can't sign in.",
        "Its review links pause: clients see that the review isn't available right now, and can't comment.",
        "Nothing is deleted. Lift the suspension to open everything again.",
      ],
      confirm: "Suspend workspace",
      pending: "Suspending…",
      done: (name: string) => `Suspended ${name}.`,
      lifted: (name: string) => `Lifted the suspension of ${name}.`,
    },
    archive: {
      title: (name: string) => `Archive ${name}?`,
      points: [
        "Its people can't open it, and its review links stop working.",
        "Nothing is deleted, and no deletion is scheduled.",
        "Unarchive it from the Archived list to open it again as it was.",
      ],
      confirm: "Archive workspace",
      pending: "Archiving…",
      done: (name: string) => `Archived ${name}.`,
      undone: (name: string) => `Unarchived ${name}.`,
    },
    errors: {
      "not-found": "This workspace isn't there any more. Reload the page to see the list as it is.",
      "no-owner": "Its owner's account is deleted, so there's no password to reset.",
      invalid: "Squint didn't accept that. Check it and try again.",
      "signed-out": "You're signed out. Sign in again, then try once more.",
      offline: "Couldn't reach Squint. Check your connection and try again.",
      failed: "Something went wrong on Squint's side, and nothing changed. Try again.",
    } satisfies Record<AdminActionError, string>,
    retry: "Try again",
  },
  categories: {
    account: "Accounts",
    workspace: "Workspaces",
    people: "People and invites",
    projects: "Projects",
    reviewLinks: "Review links",
    admin: "Admin actions",
    other: "Other",
  } satisfies Record<AuditCategory, string>,
  audit: {
    title: "Audit log",
    description: "Who changed what, newest first. Times are in UTC.",
    loading: "Loading the audit log…",
    workspace: "Workspace",
    allWorkspaces: "All workspaces",
    /** A workspace the log names that no longer exists, by its id. */
    goneWorkspace: (id: string) => `Deleted workspace ${id}`,
    actor: "Done by",
    everyone: "Anyone",
    squint: "Squint",
    squintNote: "Squint (automatic)",
    unknownPerson: (id: string) => `Unknown account ${id}`,
    action: "Action",
    allActions: "All actions",
    clear: "Clear filters",
    newer: "Newer",
    older: "Older",
    newest: "Back to newest",
    pages: "Pages",
    by: "By",
    in: "in",
    /** An actor whose account was deleted since: their email, marked. */
    deletedActor: (email: string) => `${email} (deleted account)`,
    entries: "Entries",
    emptyTitle: "No entries yet",
    emptyBody:
      "Changes to accounts, workspaces, people and review links show up here as they happen.",
    noMatchTitle: "No entries match",
    noMatchBody: "Try another workspace, person or action, or clear the filters.",
    /** Read out after a filter or page change (a polite live region). */
    status: {
      /** "Showing 50 entries, newest from Nov 17, 2026, 14:05 UTC". */
      shown: (n: number, newest: string) => `Showing ${entryCount(n)}, newest from ${newest}`,
      noMatch: "No entries match these filters",
      end: "No entries past this point",
      empty: "No entries yet",
    },
    endTitle: "Nothing more here",
    endBody: "There are no entries past this point.",
  },
  details: {
    /** "Changed: name, brand color". */
    fields: (names: readonly string[]) => `Changed: ${names.map(fieldLabel).join(", ")}`,
    reviewWindow: (choice: ReviewWindowChoice) => `Review window: ${REVIEW_WINDOW_LABELS[choice]}`,
    viaInvite: "Joined from an invite",
    /** "Switches before: review links, trash; after: trash, people". */
    switches: (before: readonly MemberSwitch[], after: readonly MemberSwitch[]) =>
      `Switches before: ${switchNames(before)}; after: ${switchNames(after)}`,
    recipients: (n: number) => `Sent to ${number.format(n)} ${n === 1 ? "person" : "people"}`,
    assigned: (assigned: boolean) => (assigned ? "Assigned in ClickUp" : "Not assigned in ClickUp"),
  },
} as const;

/** What an entry's target is, by its type; a type not listed here shows as recorded. */
export const TARGET_LABELS: Readonly<Record<string, string>> = {
  user: "Account",
  workspace: "Workspace",
  project: "Project",
  invite: "Invite",
};

/** Each action in plain words; an action not listed here shows as recorded. */
export const ACTION_LABELS: Readonly<Record<string, string>> = {
  "user.name_changed": "Changed name",
  "user.password_changed": "Changed password",
  "user.password_reset": "Reset password by email",
  "user.email_change_requested": "Asked to change email",
  "user.email_changed": "Changed email",
  "user.signed_out_everywhere": "Signed out everywhere",
  "user.avatar_changed": "Changed photo",
  "user.avatar_removed": "Removed photo",
  "user.deletion_scheduled": "Scheduled account deletion",
  "user.restored": "Restored account",
  "user.deleted": "Deleted account",
  "user.clickup_connected": "Connected ClickUp",
  "user.clickup_disconnected": "Disconnected ClickUp",
  "workspace.settings_changed": "Changed workspace settings",
  "workspace.logo_changed": "Changed workspace logo",
  "workspace.logo_removed": "Removed workspace logo",
  "workspace.deletion_scheduled": "Scheduled workspace deletion",
  "workspace.restored": "Restored workspace",
  "workspace.created": "Created workspace",
  "workspace.deleted": "Deleted workspace",
  "membership.added": "Added member",
  "membership.removed": "Removed member",
  "membership.permissions_changed": "Changed member switches",
  "member.invited": "Sent invite",
  "member.invite_resent": "Sent invite again",
  "member.invite_cancelled": "Cancelled invite",
  "project.deleted": "Deleted project",
  "project.clickup_sent": "Sent project to ClickUp",
  "share.settings_changed": "Changed review link settings",
  "share.password_set": "Set review link password",
  "share.password_removed": "Removed review link password",
  "share.invites_sent": "Sent review link invitations",
  "admin.workspace_quota_changed": "Changed workspace storage quota",
  "admin.owner_reset_link_created": "Made a password reset link for the owner",
  "admin.workspace_suspended": "Suspended workspace",
  "admin.workspace_unsuspended": "Lifted workspace suspension",
  "admin.workspace_archived": "Archived workspace",
  "admin.workspace_unarchived": "Unarchived workspace",
  "seed.user_created": "Created account during setup",
  "seed.workspace_created": "Created workspace during setup",
  "seed.owner_linked": "Made workspace owner during setup",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
