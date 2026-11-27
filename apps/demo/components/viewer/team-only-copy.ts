/** What the team reads when a comment or reply changes who sees it (057, W3, W9, W11). */

/** "1 reply stays team only." / "3 replies stay team only."; nothing for none. */
function keptBack(count: number): string {
  if (count === 0) return "";
  return count === 1 ? " 1 reply stays team only." : ` ${count} replies stay team only.`;
}

export const TEAM_ONLY_COPY = {
  make: "Make team only",
  show: "Show to client",
  hideConfirm: {
    title: (number: string) => `Make comment ${number} team only?`,
    body: "Clients won't see it or its replies any more, but they may have seen it already.",
  },
  showComment: {
    title: (number: string) => `Show comment ${number} to your client?`,
    /** `linked`: the project has a review link; `kept`: its replies that stay team only. */
    body: (linked: boolean, kept: number) =>
      (linked
        ? "Clients will see it on the review link within seconds, with any replies they could see before."
        : "Clients will see it when you share this project, with any replies they could see before.") +
      keptBack(kept),
  },
  showReply: {
    title: "Show this reply to your client?",
    /** `number`: the comment it's under, as clients number it. */
    body: (number: string, linked: boolean) =>
      linked
        ? `Clients will see it under comment ${number} on the review link within seconds.`
        : `Clients will see it under comment ${number} when you share this project.`,
  },
  toast: {
    commentHidden: (before: string, after: string) =>
      `Comment ${before} is now ${after}, team only`,
    commentShown: (before: string, after: string) =>
      `${before} is now comment ${after}, shown to your client`,
    replyHidden: "Reply is team only",
    replyShown: "Reply is shown to your client",
    failed: "Couldn't change who sees this.",
    undo: "Undo",
    retry: "Retry",
  },
} as const;
