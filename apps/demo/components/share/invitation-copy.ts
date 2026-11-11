/**
 * What a guest reads first on a workspace's review link (How it works, the
 * comments panel's notice, and the settings preview of both): who invited
 * them, to what, and how to start.
 */
export function invitationLine(company: string, project: string): string {
  return `${company} has invited you to review ${project}. Click anywhere to leave feedback.`;
}

/** The same place on an anonymous or legacy link, which has no company to name. */
export const GENERIC_INVITATION = "Here's how to leave feedback on this project.";
