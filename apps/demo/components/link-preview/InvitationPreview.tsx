import { clip, CompanyCardPreview } from "./CompanyCardPreview";

interface InvitationPreviewProps {
  company: string;
  project: string;
  /** Who the link is for; null: "invited you to review". */
  client: string | null;
  /** The company's brand color, for the logo frame and rule only; null keeps cobalt. */
  color: string | null;
  /** The logo as a PNG, JPEG or GIF data URI; null shows the company's monogram. */
  logoUri: string | null;
}

const CLIENT_MAX = 32;

/**
 * A workspace's review link: the company's card, inviting the client (by
 * name, when the link has one) to review the project.
 */
export function InvitationPreview({ client, ...card }: InvitationPreviewProps) {
  return (
    <CompanyCardPreview
      {...card}
      line={[
        { text: `invited ${client === null ? "you" : clip(client, CLIENT_MAX)} to` },
        { text: "review", highlight: true },
      ]}
    />
  );
}
