import type { MemberSwitch } from "@/lib/auth/permissions";

/**
 * Every line the Members page shows, in one place for review. Refusals and
 * failures are in `members-client.ts` (`membersErrorMessage`), the switches'
 * refusal lines in `permission-copy.ts`.
 */

/** One switch as the owner sees it: its name, and what it allows. */
interface SwitchCopy {
  label: string;
  description: (workspace: string) => string;
  /** Lower case, for the trigger's summary ("Permissions: Review links, trash"). */
  short: string;
}

const SWITCHES: Record<MemberSwitch, SwitchCopy> = {
  review_links: {
    label: "Manage client review links",
    description: () => "Create and end review links, change their settings and email clients.",
    short: "review links",
  },
  trash: {
    label: "Move projects to trash",
    description: () => "Move projects to trash and restore them.",
    short: "trash",
  },
  import: {
    label: "Import local data",
    description: (workspace) => `Bring projects saved in their browser into ${workspace}.`,
    short: "import",
  },
  people: {
    label: "Invite and remove people",
    description: () =>
      "Invite people and remove members, except you and anyone else with this switch.",
    short: "people",
  },
};

/** A member's own switch, as they read it (4b.3): what they can, or can't, do. */
const OWN: Record<MemberSwitch, { on: string; off: string }> = {
  review_links: {
    on: "You can manage client review links.",
    off: "You can copy client review links, but not change them.",
  },
  trash: {
    on: "You can move projects to trash and restore them.",
    off: "You can't move projects to trash or restore them.",
  },
  import: {
    on: "You can import projects saved in your browser.",
    off: "You can't import projects saved in your browser.",
  },
  people: {
    on: "You can invite people and remove members who don't have this permission.",
    off: "You can't invite or remove people.",
  },
};

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 seat", "3 seats": a count with its noun, singular for one. */
export function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The resend item's state (4b.2): what it's doing, or why it's off. */
export type ResendState = "ready" | "busy" | "just-sent" | "no-seat" | "limited";

export const MEMBERS_COPY = {
  loading: "Loading members",
  invite: {
    title: "Invite people",
    description: (workspace: string, emailEnabled: boolean) =>
      emailEnabled
        ? `Invite teammates who aren't in another Squint workspace. Each gets an email with a link to join ${workspace} that works for 7 days.`
        : `Invite teammates who aren't in another Squint workspace. Each invite has a link to join ${workspace} that works for 7 days.`,
    seats: {
      /** The meter's accessible name: its value text already says the numbers. */
      name: "Seats",
      /** After the bold count of seats used. */
      used: (limit: number) => `of ${limit} seats used`,
      valueText: (used: number, limit: number) => `${used} of ${limit} seats used`,
      breakdown: (members: number, invited: number) =>
        `${counted(members, "person", "people")} · ${invited} invited`,
    },
    label: "Email addresses",
    /** The chips' list name, and the count in "Added …" for screen readers. */
    noun: { list: "Addresses", one: "address", many: "addresses" },
    hint: (left: number) => `${counted(left, "seat", "seats")} left`,
    /** Typed past the seats left. */
    overflow: (left: number, overflow: number) =>
      `Only ${counted(left, "seat is", "seats are")} left, so ${counted(overflow, "address wasn't", "addresses weren't")} added.`,
    send: (count: number, sending: boolean, emailEnabled: boolean) => {
      if (emailEnabled) {
        if (sending) return "Sending…";
        if (count === 0) return "Send invites";
        return count === 1 ? "Send 1 invite" : `Send ${count} invites`;
      }
      if (sending) return "Creating…";
      if (count === 0) return "Create invites";
      return count === 1 ? "Create invite" : `Create ${count} invites`;
    },
    blocker: {
      empty: "Add at least one email address first.",
      marked: (count: number) =>
        count === 1 ? "Remove the marked address first." : "Remove the marked addresses first.",
    },
    emailOff:
      "Email isn't set up on this site. After you invite someone, copy their link from the list and send it yourself.",
    /** Per address, under the field (4b.2). */
    refused: {
      "already-member": (email: string, workspace: string) =>
        `${email} is already in ${workspace}.`,
      "already-invited": (email: string) => `${email} already has an invite.`,
      "in-another-workspace": (email: string) =>
        `${email} already uses Squint in another workspace. For now, each person can be in only one.`,
      "cannot-invite": "This address can't be invited. Try a different one.",
    },
    /**
     * The already-invited line's own recovery, for screen readers: which address
     * it resends. The address goes after the action and before any reason or
     * ellipsis: "Resend email for ana@x.com (sent just now)", "Resending for ana@x.com…".
     */
    resendFor: (label: string, email: string) => {
      const reason = label.indexOf(" (");
      if (reason !== -1) return `${label.slice(0, reason)} for ${email}${label.slice(reason)}`;
      if (label.endsWith("…")) return `${label.slice(0, -1)} for ${email}…`;
      return `${label} for ${email}`;
    },
    /** After a send: who it went to, and how many weren't invited. */
    done: (sent: readonly string[], refused: number, emailEnabled: boolean) => {
      const verb = emailEnabled ? "sent to" : "created for";
      const lines: string[] = [];
      if (sent.length === 1) lines.push(`Invite ${verb} ${sent[0]}.`);
      else if (sent.length > 1) lines.push(`Invites ${verb} ${sent.length} people.`);
      if (refused === 1) lines.push("1 address wasn't invited: the reason is on its chip.");
      else if (refused > 1) {
        lines.push(`${refused} addresses weren't invited: the reason is on each marked chip.`);
      }
      return lines.join(" ");
    },
    /** Email is on, but Resend refused this send: the invites stand. */
    notEmailed: (count: number) =>
      count === 1
        ? "Invite created, but the email didn't go out. Copy the link from the list, or try Resend email in a minute."
        : "Invites created, but the emails didn't go out. Copy the links from the list, or try Resend email in a minute.",
    full: {
      nothingSent: "Nothing was sent.",
      title: (limit: number) =>
        limit === 1 ? "The only seat is taken." : `All ${limit} seats are taken.`,
      body: "To invite someone new, cancel an invite or remove someone. Need more seats? Ask your Squint admin.",
      overTitle: (workspace: string, used: number, limit: number) =>
        `${workspace} has more people than seats (${used} of ${limit}).`,
      overBody: (limit: number) =>
        `You can invite again once fewer than ${limit} seats are in use. Need more seats? Ask your Squint admin.`,
    },
  },
  invites: {
    title: "Pending invites",
    invited: "Invited",
    expired: "Expired",
    invitedBy: (name: string) => `Invited by ${name}`,
    expiresIn: (days: number) => `Expires in ${counted(days, "day", "days")}`,
    expiredOn: (date: string) => `Expired on ${date}`,
    emailNotSent: "Email not sent",
    copyLink: "Copy link",
    /** The inline Copy link's name for screen readers: whose link. */
    copyLinkFor: (email: string) => `Copy link for ${email}`,
    actions: (email: string) => `Actions for ${email}`,
    copyInviteLink: "Copy invite link",
    cancel: "Cancel invite",
    cancelling: "Cancelling…",
    resend: (state: ResendState, expired: boolean, emailEnabled: boolean): string => {
      if (!emailEnabled) {
        if (state === "busy") return "Renewing…";
        return state === "no-seat" ? "Renew link (no seat free)" : "Renew link";
      }
      const base = expired ? "Resend and renew" : "Resend email";
      switch (state) {
        case "busy":
          return "Resending…";
        case "just-sent":
          return "Resend email (sent just now)";
        case "no-seat":
          return "Resend and renew (no seat free)";
        case "limited":
          return `${base} (daily limit reached)`;
        case "ready":
          return base;
      }
    },
    copied: "Invite link copied.",
    copyFailed: "Couldn't copy the link.",
    showLink: "Show link",
    linkDialog: {
      title: (email: string) => `Invite link for ${email}`,
      label: "Invite link",
      done: "Done",
    },
    resent: (email: string, date: string) =>
      `Sent again to ${email}. The link works until ${date}.`,
    resendNotEmailed: (email: string, date: string) =>
      `The email to ${email} didn't go out, but the link now works until ${date}. Copy the link from the list and send it yourself.`,
    renewed: (date: string) => `Link renewed. It works until ${date}.`,
    cancelled: (email: string) => `Invite for ${email} cancelled.`,
  },
  leaving: {
    title: "Leaving",
    description: "These people deleted their own account. They don't use a seat.",
    chip: "Leaving",
    until: (date: string) => `Leaves for good on ${date}`,
  },
  empty: {
    title: "Just you so far",
    line: (left: number) =>
      left === 1
        ? "Invite 1 more person to review with you."
        : `Invite up to ${left} people to review with you.`,
  },
  people: {
    title: "People",
    description: {
      /** The owner's, and a member's with the people switch. */
      managed: (workspace: string) => `Everyone in ${workspace}.`,
      member: (workspace: string, owner: string) =>
        `Everyone in ${workspace}. To invite someone, ask ${owner}.`,
    },
    /** The list's heading: active people only. */
    count: (count: number) => (count === 1 ? "1 person" : `${count} people`),
    you: "You",
    owner: "Owner",
    /** In place of a name nobody has set (a member's view has no email to show instead). */
    noName: "No name yet",
    joined: (date: string) => `Joined ${date}`,
    actions: (name: string) => `Actions for ${name}`,
    remove: "Remove from workspace",
  },
  permissions: {
    switches: SWITCHES,
    /** The disclosure's trigger: the switches that are on, in order. */
    trigger: (on: readonly MemberSwitch[]) => {
      if (on.length === 0) return "Permissions: All off";
      if (on.length === Object.keys(SWITCHES).length) return "Permissions: All on";
      return `Permissions: ${sentenceCase(on.map((value) => SWITCHES[value].short).join(", "))}`;
    },
    /** The panel's name for screen readers; the row above already shows whose it is. */
    group: (name: string) => `What ${name} can do`,
    /** After each switch's label, for screen readers: no two switches on the page sound alike. */
    forName: (name: string) => ` for ${name}`,
    saving: "Saving…",
    saved: "Saved.",
  },
  own: {
    title: "What you can do",
    line: (value: MemberSwitch, on: boolean) => OWN[value][on ? "on" : "off"],
    /** Once, under the lines, when at least one is off. */
    ask: (owner: string) => `To change any of these, ask ${owner}.`,
  },
  remove: {
    title: (name: string, workspace: string) => `Remove ${name} from ${workspace}?`,
    points: (workspace: string) => [
      `They're signed out right away and can no longer open ${workspace} or its projects.`,
      "Their comments stay, under their name. Projects, folders and uploads stay in the workspace.",
      "Their ClickUp connection is removed.",
      "Their Squint account is deleted after 24 hours.",
      "This can't be undone. If you invite them again within 24 hours, they get their account back and their comments reconnect to them. After that, they'd join with a new account.",
    ],
    confirm: (name: string) => `Remove ${name}`,
    pending: "Removing…",
    done: (name: string) => `${name} was removed.`,
  },
} as const;
