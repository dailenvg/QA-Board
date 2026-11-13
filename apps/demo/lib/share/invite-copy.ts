/**
 * One invitation to review, in words: the email Squint sends, the message an
 * owner pastes into Slack, ClickUp or Messages, and the Share window's
 * preview of both all read from here, so they never drift apart. Plain
 * strings: whatever shows them escapes them. Never the link's password: only
 * whether it has one.
 */

export interface InviteDetails {
  /** The company inviting: the workspace's name, as guests see it. */
  company: string;
  project: string;
  /** Who the link is for; null greets plainly ("Hi,"). */
  client: string | null;
  /** The review link. */
  link: string;
  /** When clients can no longer comment (epoch ms); null: no limit. */
  reviewEndsAt: number | null;
  /** Whether guests need a password to open it. Its value never comes here. */
  hasPassword: boolean;
}

/** "Sun, Nov 15, 4:30 PM UTC": in UTC, since the email can't know where its reader is. */
const DEADLINE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function inviteDeadline(endsAt: number): string {
  return DEADLINE.format(endsAt);
}

export interface InviteCopy {
  subject: string;
  /** "Hi {Client}," or "Hi,". */
  greeting: string;
  /** "{Company} has invited you to review {Project}" (no full stop: a heading). */
  headline: string;
  /** "You can comment until {date}."; null without a review window. */
  deadline: string | null;
  /** That it's password protected and who sends the password; null on an open link. */
  passwordNote: string | null;
  /** How to start, for someone who's never used Squint. */
  howTo: string;
}

export function inviteCopy(details: InviteDetails): InviteCopy {
  const { company, project, client, reviewEndsAt, hasPassword } = details;
  const headline = `${company} has invited you to review ${project}`;
  return {
    subject: headline,
    greeting: client ? `Hi ${client},` : "Hi,",
    headline,
    deadline:
      reviewEndsAt === null ? null : `You can comment until ${inviteDeadline(reviewEndsAt)}.`,
    passwordNote: hasPassword
      ? `It's password protected. ${company} will send you the password separately.`
      : null,
    howTo: "No account needed: open the link, drop a pin and leave a comment.",
  };
}

/**
 * The invitation as a message an owner sends themselves (Slack, ClickUp,
 * Messages, the system share sheet): the email's words, the link on its own
 * line so chat apps unfurl it.
 */
export function inviteMessage(details: InviteDetails): string {
  const copy = inviteCopy(details);
  return [
    copy.greeting,
    "",
    `${copy.headline}:`,
    details.link,
    ...(copy.deadline || copy.passwordNote ? [""] : []),
    ...(copy.deadline ? [copy.deadline] : []),
    ...(copy.passwordNote ? [copy.passwordNote] : []),
  ].join("\n");
}
