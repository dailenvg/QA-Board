/**
 * Who invited whom, and to review what: the start of a guest's invitation
 * line. Null `company` on a link without one; null `client` when the link
 * names nobody ("invited you").
 */
export function invitedToReview(
  company: string | null,
  project: string,
  client: string | null = null,
): string {
  if (company === null) return `You've been invited to review ${project}`;
  return `${company} has invited ${client ?? "you"} to review ${project}`;
}

/**
 * The password screen's heading. The brand row above it already names the
 * company, so the heading goes on from it: "invited you to review
 * {Project}", or "invited {Client} to review {Project}". A link without a
 * company keeps the whole sentence.
 */
export function lockedHeading(
  company: string | null,
  project: string,
  client: string | null = null,
): string {
  if (company === null) return invitedToReview(null, project);
  return `invited ${client ?? "you"} to review ${project}`;
}

/**
 * What a guest reads first on a workspace's review link (How it works, the
 * comments panel's notice, and the settings preview of both): who invited
 * them, to what, and how to start.
 */
export function invitationLine(
  company: string,
  project: string,
  client: string | null = null,
): string {
  return `${invitedToReview(company, project, client)}. Choose Comment (or press C), then click or tap anywhere to leave feedback.`;
}

/** The same place on an anonymous or legacy link, which has no company to name. */
export const GENERIC_INVITATION = "Here's how to leave feedback on this project.";
