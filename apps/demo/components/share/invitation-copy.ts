/**
 * Who invited the guest, and to review what: the password screen's heading,
 * and the start of the invitation line. Null `company` on a link without one.
 */
export function invitedToReview(company: string | null, project: string): string {
  return company === null
    ? `You've been invited to review ${project}`
    : `${company} has invited you to review ${project}`;
}

/**
 * What a guest reads first on a workspace's review link (How it works, the
 * comments panel's notice, and the settings preview of both): who invited
 * them, to what, and how to start.
 */
export function invitationLine(company: string, project: string): string {
  return `${invitedToReview(company, project)}. Choose Comment (or press C), then click or tap anywhere to leave feedback.`;
}

/** The same place on an anonymous or legacy link, which has no company to name. */
export const GENERIC_INVITATION = "Here's how to leave feedback on this project.";
