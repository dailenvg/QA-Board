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
  /**
   * When it goes out (epoch ms), so the deadline can say how long is left;
   * defaults to now. The Share window passes its clock, so its preview and
   * the other ways' message say what an email sent now would.
   */
  sentAt?: number;
}

const HOUR = 60 * 60 * 1000;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/**
 * How long the reader has to comment, counted from `sentAt`: "about 3 days",
 * "about 20 hours", "less than an hour". Relative, never a clock time: the
 * email can't know its reader's time zone, and a date or time in the
 * server's zone (or UTC) would disagree with the owner's own Settings row.
 * Rounded to the nearest day from two days up, else to the nearest hour.
 */
export function inviteTimeLeft(endsAt: number, sentAt: number): string {
  const hours = Math.max(0, endsAt - sentAt) / HOUR;
  if (hours < 1) return "less than an hour";
  if (hours >= 48) return `about ${plural(Math.round(hours / 24), "day")}`;
  return `about ${plural(Math.round(hours), "hour")}`;
}

export interface InviteCopy {
  subject: string;
  /** "Hi {Client}," or "Hi,". */
  greeting: string;
  /** "{Company} has invited you to review {Project}" (no full stop: a heading). */
  headline: string;
  /** "You have about {3 days} to comment." (or that it's closed); null without a review window. */
  deadline: string | null;
  /** That it's password protected and who sends the password; null on an open link. */
  passwordNote: string | null;
  /** How to start, for someone who's never used Squint. */
  howTo: string;
}

export function inviteCopy(details: InviteDetails): InviteCopy {
  const { company, project, client, reviewEndsAt, hasPassword, sentAt = Date.now() } = details;
  const headline = `${company} has invited you to review ${project}`;
  return {
    subject: headline,
    greeting: client ? `Hi ${client},` : "Hi,",
    headline,
    // Closed: nothing can be sent then, but the Share window's preview still shows the truth.
    deadline:
      reviewEndsAt === null
        ? null
        : sentAt >= reviewEndsAt
          ? "The review window has closed."
          : `You have ${inviteTimeLeft(reviewEndsAt, sentAt)} to comment.`,
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
