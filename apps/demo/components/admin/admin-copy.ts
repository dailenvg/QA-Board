import type { AuditCategory } from "@/lib/admin/audit-category";
import { MAX_QUOTA_GB, MIN_QUOTA_GB } from "@/lib/admin/quota";
import type { RateLimitBackend, RateLimitId, RateLimitScope } from "@/lib/admin/rate-limits";
import type { ServiceId } from "@/lib/admin/services";
import type { StorageActionError } from "@/lib/admin/storage-client";
import type { AdminActionError } from "@/lib/admin/workspaces-client";
import type { CronRunStatus } from "@/lib/cron/cron-runs";
import type { CronTrigger, ExpiryStep } from "@/lib/cron/expiry-steps";
import type { CRON_SCHEDULE } from "@/lib/cron/schedule";
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

/** "1 file", "1,204 files". */
export function fileCount(n: number): string {
  return `${number.format(n)} ${n === 1 ? "file" : "files"}`;
}

/** A run's length: "Under 1 s", "12 s", "1 min 5 s". */
export function runDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) return "Under 1 s";
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return rest ? `${Math.floor(seconds / 60)} min ${rest} s` : `${seconds / 60} min`;
}

/** A run as it goes, by the whole seconds so far: "Starting", then "Running for 12 s". */
function runningFor(seconds: number | null): string {
  return seconds === null || seconds < 1
    ? "Starting"
    : `Running for ${runDuration(seconds * 1000)}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A limit's window: "minute", "15 minutes", "hour", "day". */
function windowLabel(ms: number): string {
  const [size, unit] =
    ms % DAY_MS === 0
      ? [ms / DAY_MS, "day"]
      : ms % HOUR_MS === 0
        ? [ms / HOUR_MS, "hour"]
        : [ms / MINUTE_MS, "minute"];
  return size === 1 ? unit : `${number.format(size)} ${unit}s`;
}

/** What a rate limit counts by, after "per". */
const RATE_LIMIT_SCOPES: Record<RateLimitScope, string> = {
  address: "IP address",
  email: "email address",
  account: "account",
  link: "review link",
  workspace: "workspace",
  member: "member",
};

/** Each cleanup step in plain words, as what it deletes. */
export const STEP_LABELS = {
  shares: "Expired review links",
  blobs: "Review link files left behind",
  passwordAttempts: "Wrong review link password tries",
  inviteSends: "Review link invitation records",
  memberInvites: "Ended workspace invites",
  memberInviteSends: "Workspace invite email records",
  trash: "Projects past 30 days in the trash",
  archived: "Archived projects past their date",
  accounts: "Deleted accounts past 30 days",
  workspaceBlobs: "Workspace files with no record",
  pins: "Pinpoint pins past 30 days",
} as const satisfies Record<ExpiryStep, string>;

/** Steps by name, in plain words: "expired review links, pinpoint pins past 30 days". */
function stepNames(steps: readonly ExpiryStep[]): string {
  return steps
    .map((step, index) => (index ? STEP_LABELS[step].toLowerCase() : STEP_LABELS[step]))
    .join(", ");
}

/** The cleanup's schedule in words, by the cron expression `vercel.json` sets. */
const SCHEDULE_LABELS: Record<typeof CRON_SCHEDULE, string> = {
  "0 4 * * *": "daily at 04:00 UTC",
};

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
  archived_at: "archive status",
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
      "Every workspace, its owner and how much it stores. Last activity is the latest project change, comment or change by its people. Dates are in UTC.",
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
      resetNoOwner: "Can't reset password: no active owner",
      suspend: "Suspend",
      unsuspend: "Lift suspension",
      archive: "Archive",
      /** In place of `archive`, unavailable, when the owner scheduled the workspace for deletion. */
      archiveDeleting: "Can't archive: scheduled for deletion",
      working: "Working…",
    },
    emptyTitle: "No workspaces yet",
    emptyBody: "Workspaces show up here once they're set up.",
    archived: {
      title: "Archived",
      description:
        "Locked, with everything kept. Archiving never schedules a deletion. Unarchive one to open it again as it was.",
      emptyTitle: "Nothing archived",
      emptyBody: "Archived workspaces show up here.",
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
        `Make a link that lets ${email} set a new password. It's shown only once, here. It expires in 1 hour and works only once. Nothing is emailed, so send it to them yourself.`,
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
        "Its members can't open it. Anyone without another open workspace is signed out and can't sign in.",
        "Its review links pause: clients see that the review isn't available right now and can't comment.",
        "All its data is kept. Lift the suspension at any time to open everything again.",
      ],
      confirm: "Suspend workspace",
      pending: "Suspending…",
      done: (name: string) => `Suspended ${name}.`,
      lifted: (name: string) => `Lifted the suspension of ${name}.`,
    },
    archive: {
      title: (name: string) => `Archive ${name}?`,
      points: [
        "It's locked: its members can't open it, and its review links stop working.",
        "Nothing is deleted, and no deletion is scheduled.",
        "To undo it, unarchive it from the Archived list. It opens again as it was.",
      ],
      confirm: "Archive workspace",
      pending: "Archiving…",
      done: (name: string) => `Archived ${name}.`,
      undone: (name: string) => `Unarchived ${name}.`,
    },
    errors: {
      "not-found": "This workspace isn't there any more. Reload the page to see the current list.",
      "no-owner": "This workspace has no active owner, so there's no password to reset.",
      deleting:
        "Its owner scheduled this workspace for deletion, so it can't be archived. Nothing changed.",
      invalid: "Squint didn't accept that. Check it and try again.",
      "signed-out": "You're signed out. Sign in again, then try once more.",
      offline: "Couldn't reach Squint. Check your connection and try again.",
      failed: "Something went wrong on Squint's side, and nothing changed. Try again.",
    } satisfies Record<AdminActionError, string>,
    retry: "Try again",
  },
  storage: {
    loading: "Loading storage…",
    /** The two tiles' section, for screen readers. */
    summary: "Storage and cleanup",
    errors: {
      running:
        "The cleanup is already running. Give it a minute, then check its last run on the System page.",
      "signed-out": "You're signed out. Sign in again, then try once more.",
      "not-found": "You're no longer signed in as the admin. Reload the page.",
      offline: "Couldn't reach Squint. Check your connection and try again.",
      failed: "Something went wrong on Squint's side. Try again.",
    } satisfies Record<StorageActionError, string>,
    total: {
      label: "Stored",
      /** "1,204 files across every workspace". */
      note: (files: number) => `${fileCount(files)} across every workspace`,
    },
    workspaces: {
      title: "Workspaces storing the most",
      description: "The 10 biggest, against their storage quota.",
      emptyTitle: "Nothing stored yet",
      emptyBody: "Workspaces show up here once they store files.",
      owner: "Owner",
    },
    projects: {
      title: "Projects storing the most",
      description:
        "The 10 biggest across every workspace. Projects in the trash count until they're deleted for good.",
      emptyTitle: "Nothing stored yet",
      emptyBody: "Projects show up here once they hold uploads, snapshots or comment screenshots.",
      /** "in Acme". */
      inWorkspace: (name: string) => `in ${name}`,
      trashed: "In the trash",
      size: "Size",
    },
    orphans: {
      title: "Orphaned files",
      description:
        "Files left behind by a failed delete or an unfinished upload. The daily cleanup deletes them. A check runs only when you ask, since Vercel Blob charges for it.",
      check: "Check for orphans",
      checking: "Checking…",
      checkAgain: "Check again",
      idleTitle: "Not checked yet",
      idleBody: "Check to count what the next cleanup would delete. Nothing is deleted.",
      categories: {
        shareFiles: "Review link files with no live link",
        workspaceRows: "File records whose project is gone",
        unrecordedFiles: "Workspace, logo and photo files with no record",
      },
      /** A category that doesn't apply: its files aren't kept in Vercel Blob on this deployment. */
      notApplicable: "Not in Vercel Blob here",
      /** "3 files, 1.2 MB". */
      tally: (files: number, bytes: string | null) =>
        bytes === null ? `${fileCount(files)}, size unknown` : `${fileCount(files)}, ${bytes}`,
      none: "None",
      partial: "The check ran out of time before it saw every file, so there may be more.",
      /** "Checked Nov 18, 2026, 09:05 UTC". */
      checkedAt: (when: string) => `Checked ${when}`,
      failed: "Couldn't check just now. Nothing was deleted. Try again.",
    },
    sweep: {
      title: "Daily cleanup",
      /** "Runs daily at 04:00 UTC." */
      schedule: (schedule: typeof CRON_SCHEDULE) => `Runs ${SCHEDULE_LABELS[schedule]}.`,
      run: "Run sweep",
      /** In place of `run` while a run started here goes on with its dialog closed: reopens it. */
      seeProgress: "See progress",
      /** In place of `run` once that run finished with its dialog closed: reopens it on the result. */
      seeResult: "See result",
      /**
       * "Last run Nov 18, 2026, 04:00 UTC: Finished", in three parts so only
       * the date sits in a `<time>`: the label, the date, then the status.
       */
      lastRun: {
        label: "Last run",
        /** After the date: ": Finished". */
        status: (status: string) => `: ${status}`,
      },
      /** In place of the last run while a run started here goes on with its dialog closed. */
      runningNow: "Running now…",
      neverRun: "It hasn't run yet.",
      dialog: {
        title: "Run the daily cleanup now?",
        description:
          "It deletes everything that's due: expired review links, projects past their time in the trash or archive, deleted accounts past 30 days, and orphaned files. What it deletes is gone for good.",
        checking: "Counting orphaned files…",
        orphans: "Orphaned files it would delete",
        checkFailed: "Couldn't count orphaned files. You can still run the cleanup.",
        checkAgain: "Count again",
        cancel: "Cancel",
        /** In place of `cancel` while it runs: closing doesn't stop it. */
        close: "Close",
        confirm: "Run sweep",
        pending: "Running…",
        /** Read out once as it starts (a polite live region). */
        started: "Running the cleanup. It can take up to a minute.",
        /**
         * Under the progress bar while it runs, the time ticking each second:
         * "Running for 12 s. Closing this won't stop it."
         */
        progress: (seconds: number | null) => `${runningFor(seconds)}. Closing this won't stop it.`,
        done: "Done",
      },
      result: {
        finished: "The cleanup finished.",
        partial: "The cleanup ran out of time. The next run carries on where it stopped.",
        /** "Some steps failed: expired review links, pinpoint pins past 30 days. The next run tries them again." */
        failed: (steps: readonly ExpiryStep[]) =>
          `Some steps failed: ${stepNames(steps)}. The next run tries them again.`,
        deleted: "Deleted",
        nothing: "Nothing was due.",
        /** A step's count: "2". */
        count: (n: number) => number.format(n),
      },
    },
  },
  system: {
    loading: "Loading the system summary…",
    services: {
      title: "Services",
      description: "Whether each one is set up on this deployment. Values are never shown here.",
      configured: "Configured",
      notConfigured: "Not configured",
      optional: "Optional",
      items: {
        database: { name: "Database", what: "Postgres, for accounts, workspaces and review links" },
        blob: { name: "Blob storage", what: "Vercel Blob, for uploads, snapshots and photos" },
        resendKey: { name: "Email sending", what: "The Resend API key" },
        emailFrom: { name: "Email sender", what: "The address emails come from" },
        authSecret: {
          name: "Auth secret",
          what: "Seals review link secrets, guest passes and ClickUp tokens",
        },
        projectAuthKey: { name: "Project auth key", what: "Reserved for a later milestone" },
        cronSecret: { name: "Cron secret", what: "Lets Vercel Cron run the daily cleanup" },
        authUrl: {
          name: "Auth URL",
          what: "Where reset, email change and ClickUp links point. Without it, the site's own address",
        },
        clickUp: { name: "ClickUp", what: "Members connect their own ClickUp" },
        captureService: {
          name: "Capture service",
          what: "An outside service for website captures. Without it, this server captures",
        },
        pinpointGitHub: { name: "Pinpoint GitHub storage", what: "Keeps widget pins in GitHub" },
        pinpointReviewToken: {
          name: "Pinpoint review token",
          what: "Turns on the review link page",
        },
      } satisfies Record<ServiceId, { name: string; what: string }>,
    },
    cron: {
      title: "Daily cleanup runs",
      /** "Runs daily at 04:00 UTC. The latest 20 runs, newest first, with times in UTC." */
      description: (schedule: typeof CRON_SCHEDULE, shown: number) =>
        `Runs ${SCHEDULE_LABELS[schedule]}. The latest ${shown} runs, newest first, with times in UTC.`,
      columns: { trigger: "Started by", started: "Started", duration: "Took", status: "Status" },
      trigger: { schedule: "Schedule", admin: "Admin" } satisfies Record<CronTrigger, string>,
      status: {
        finished: "Finished",
        partial: "Partly done",
        failed: "Failed steps",
        running: "Running",
        abandoned: "Didn't finish",
      } satisfies Record<CronRunStatus, string>,
      /** Under a failed run's status: "Expired review links, pinpoint pins past 30 days". */
      failedSteps: (steps: readonly ExpiryStep[]) => stepNames(steps),
      noDuration: "Not finished",
      emptyTitle: "No runs yet",
      emptyBody: "Runs show up here once the schedule or Run sweep starts one.",
    },
    rateLimits: {
      title: "Rate limits",
      description:
        "Every limit Squint applies. Postgres limits hold across all servers. In-memory ones count per server instance, so they're a brake, not an exact cap.",
      backends: {
        postgres: "Postgres, across every server",
        memory: "In memory, per server instance",
      } satisfies Record<RateLimitBackend, string>,
      /** "5 per 15 minutes, per email address". */
      rule: (limit: number, windowMs: number, per: RateLimitScope) =>
        `${number.format(limit)} per ${windowLabel(windowMs)}, per ${RATE_LIMIT_SCOPES[per]}`,
      items: {
        signInEmail: "Failed sign-ins",
        signInAddress: "Failed sign-ins",
        resetEmails: "Password reset emails",
        emailChanges: "Email change requests",
        linkPasswordLink: "Wrong review link passwords",
        linkPasswordAddress: "Wrong review link passwords",
        linkInvitesWorkspace: "Review link invitation emails",
        linkInvitesMember: "Review link invitation emails",
        memberInvites: "Workspace invite emails",
        resetRequests: "Password reset requests",
        join: "Accepting workspace invites",
        imageUploads: "Photo and logo uploads",
        capture: "Website captures",
        shareCreate: "New review links",
        shareOwnerWrite: "Review link changes by its owner",
        shareOwnerRead: "Review link reads by its owner",
        clientRead: "Client reads of a review link",
        clientComment: "Client comments",
        clientEdit: "Client comment edits",
        clientCapture: "Client website captures",
        clientUnlock: "Review link password tries",
        card: "Link preview cards",
        clickUpConnect: "ClickUp connect attempts",
        clickUpSend: "Sends to ClickUp",
        clickUpRead: "ClickUp list reads",
        pinpoint: "Pinpoint widget pins",
      } satisfies Record<RateLimitId, string>,
    },
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
  "admin.owner_reset_link_created": "Made password reset link for owner",
  "admin.workspace_suspended": "Suspended workspace",
  "admin.workspace_unsuspended": "Lifted workspace suspension",
  "admin.workspace_archived": "Archived workspace",
  "admin.workspace_unarchived": "Unarchived workspace",
  "admin.sweep_run": "Ran daily cleanup",
  "seed.user_created": "Created account during setup",
  "seed.workspace_created": "Created workspace during setup",
  "seed.owner_linked": "Made workspace owner during setup",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
