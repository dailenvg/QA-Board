/**
 * The company badge on the team's avatars (4b.15): the company's icon when it
 * has a logo, else its default badge in its color, drawn in place.
 */
export interface CompanyBadge {
  /** The company icon's URL (its logo drawn square); null without a logo. */
  logoSrc: string | null;
  /** Its brand color (`#rrggbb`); null: the default's magenta. */
  color: string | null;
}
