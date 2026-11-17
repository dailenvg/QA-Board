/**
 * The company badge on the team's avatars (4b.15): the company's icon when it
 * has a logo, else its default gray badge, drawn in place.
 */
export interface CompanyBadge {
  /** The company icon's URL (its logo drawn square); null without a logo. */
  logoSrc: string | null;
}
