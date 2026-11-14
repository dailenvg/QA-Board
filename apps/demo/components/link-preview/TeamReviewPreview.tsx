import { CompanyCardPreview } from "./CompanyCardPreview";

interface TeamReviewPreviewProps {
  company: string;
  project: string;
  /** The company's brand color, for the logo frame and rule only; null keeps cobalt. */
  color: string | null;
  /** The logo as a PNG, JPEG or GIF data URI; null shows the company's monogram. */
  logoUri: string | null;
}

/** A project's own link (`/p/<id>`): the company's card, the project ready for its team's review. */
export function TeamReviewPreview(card: TeamReviewPreviewProps) {
  return (
    <CompanyCardPreview
      {...card}
      line={[{ text: "ready for your team’s" }, { text: "review", highlight: true }]}
    />
  );
}
