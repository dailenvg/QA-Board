import type { Comment } from "./types";

/**
 * A pin's number within its sequence (D13): comments clients see are 1..n,
 * the same numbers a guest of the review link sees, and team-only ones are
 * T1..Tn, so keeping one to the team never moves the numbers clients know.
 */
export interface PinNumber {
  /** 1-based, within its own sequence. */
  number: number;
  teamOnly: boolean;
  /** What the pin shows: "4", or "T1" for a team-only one. */
  label: string;
}

/** "4", or "T1" for a team-only comment. */
export const pinTag = (number: number, teamOnly: boolean) =>
  teamOnly ? `T${number}` : String(number);

/**
 * Each comment's number, in creation order across the project, resolved or
 * not: `comments` come in that order (`commentsFor`). Clients' sequence and
 * the team's are counted apart.
 */
export function pinNumbers(comments: readonly Comment[]): Map<string, PinNumber> {
  const counts = { shown: 0, team: 0 };
  return new Map(
    comments.map((comment) => {
      const teamOnly = comment.teamOnly === true;
      const number = teamOnly ? (counts.team += 1) : (counts.shown += 1);
      return [comment.id, { number, teamOnly, label: pinTag(number, teamOnly) }];
    }),
  );
}

/** Where each comment comes in creation order (0-based), for sorting by pin across both sequences. */
export function pinOrder(comments: readonly Comment[]): Map<string, number> {
  return new Map(comments.map((comment, index) => [comment.id, index]));
}
