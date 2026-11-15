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

export const MEMBERS_COPY = {
  loading: "Loading members",
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
