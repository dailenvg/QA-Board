import type { AuditCategory } from "@/lib/admin/audit-category";
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

export const ADMIN_COPY = {
  title: "Admin",
  /** In the account settings, for the admin: back to the panel. */
  backToAdmin: "Back to admin",
  summary: "Everything across Squint's workspaces, read-only.",
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
  categories: {
    account: "Accounts",
    workspace: "Workspaces",
    people: "People and invites",
    projects: "Projects",
    reviewLinks: "Review links",
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
      /** "50 entries shown, newest Nov 17, 2026, 14:05 UTC". */
      shown: (n: number, newest: string) => `${entryCount(n)} shown, newest ${newest}`,
      noMatch: "No entries match these filters",
      end: "No more entries here",
      empty: "No entries yet",
    },
    endTitle: "Nothing more here",
    endBody: "Go back to the newest entries to keep reading.",
  },
  details: {
    /** "Changed name, brand_color". */
    fields: (names: readonly string[]) => `Changed ${names.join(", ")}`,
    reviewWindow: (choice: ReviewWindowChoice) => `Review window: ${REVIEW_WINDOW_LABELS[choice]}`,
    viaInvite: "Joined from an invite",
    switches: (before: readonly MemberSwitch[], after: readonly MemberSwitch[]) =>
      `Switches went from ${switchNames(before)} to ${switchNames(after)}`,
    recipients: (n: number) => `Sent to ${n} ${n === 1 ? "person" : "people"}`,
    assigned: (assigned: boolean) => (assigned ? "Assigned in ClickUp" : "Not assigned"),
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
  "user.name_changed": "Name changed",
  "user.password_changed": "Password changed",
  "user.password_reset": "Password reset by email",
  "user.email_change_requested": "Email change requested",
  "user.email_changed": "Email changed",
  "user.signed_out_everywhere": "Signed out everywhere",
  "user.avatar_changed": "Photo changed",
  "user.avatar_removed": "Photo removed",
  "user.deletion_scheduled": "Account deletion scheduled",
  "user.restored": "Account restored",
  "user.deleted": "Account deleted",
  "user.clickup_connected": "ClickUp connected",
  "user.clickup_disconnected": "ClickUp disconnected",
  "workspace.settings_changed": "Workspace settings changed",
  "workspace.logo_changed": "Workspace logo changed",
  "workspace.logo_removed": "Workspace logo removed",
  "workspace.deletion_scheduled": "Workspace deletion scheduled",
  "workspace.restored": "Workspace restored",
  "workspace.created": "Workspace created",
  "workspace.deleted": "Workspace deleted",
  "membership.added": "Member added",
  "membership.removed": "Member removed",
  "membership.permissions_changed": "Member switches changed",
  "member.invited": "Member invited",
  "member.invite_resent": "Invite sent again",
  "member.invite_cancelled": "Invite cancelled",
  "project.deleted": "Project deleted",
  "project.clickup_sent": "Project sent to ClickUp",
  "share.settings_changed": "Review link settings changed",
  "share.password_set": "Review link password set",
  "share.password_removed": "Review link password removed",
  "share.invites_sent": "Review link invitations sent",
  "seed.user_created": "Account created by setup",
  "seed.workspace_created": "Workspace created by setup",
  "seed.owner_linked": "Owner linked by setup",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
