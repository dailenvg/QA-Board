import { PAPER } from "@/lib/brand-palette";
import { PreviewFrame } from "./PreviewFrame";
import { PreviewText } from "./PreviewText";
import { SharedReviewArt } from "./SharedReviewArt";
import { PREVIEW_COLORS } from "./preview-theme";

interface InvitationPreviewProps {
  company: string;
  project: string;
  /** The company's brand color, for the logo frame and rule only; null keeps cobalt. */
  color: string | null;
  /** The logo as a PNG, JPEG or GIF data URI; null shows the name alone. */
  logoUri: string | null;
}

const COMPANY_MAX = 40;
const PROJECT_MAX = 64;
const LOGO_FRAME = 112;

/** At most `max` characters, ending in an ellipsis when cut. */
function clip(text: string, max: number): string {
  const characters = Array.from(text.trim());
  if (characters.length <= max) return characters.join("");
  const kept = characters.slice(0, max - 1).join("");
  return `${kept.trimEnd()}…`;
}

/** Long project names step down a size so three lines still fit beside Squiggy. */
function projectSize(project: string): number {
  const length = Array.from(project).length;
  if (length <= 20) return 80;
  if (length <= 40) return 64;
  return 52;
}

function CompanyLogo({ uri, accent }: { uri: string; accent: string }) {
  return (
    <div
      style={{
        width: LOGO_FRAME,
        height: LOGO_FRAME,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 12,
        borderRadius: 32,
        background: PAPER,
        border: `4px solid ${accent}`,
        boxShadow: `0 16px 32px -20px ${PREVIEW_COLORS.shadow}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only. */}
      <img src={uri} alt="" width={80} height={80} style={{ objectFit: "contain" }} />
    </div>
  );
}

/**
 * A workspace's review link: the company (its logo when the card can draw
 * it), the invitation, and the project's name, with Squiggy beside them.
 */
export function InvitationPreview({ company, project, color, logoUri }: InvitationPreviewProps) {
  const accent = color ?? PREVIEW_COLORS.accent;
  const name = clip(project, PROJECT_MAX);
  const size = projectSize(name);
  return (
    <PreviewFrame art={<SharedReviewArt />}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {logoUri ? <CompanyLogo uri={logoUri} accent={accent} /> : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: logoUri ? 480 : 620,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: -1,
              lineHeight: 1.1,
              color: PREVIEW_COLORS.ink,
              // A name with no spaces breaks inside its column instead of running under Squiggy.
              wordBreak: "break-word",
            }}
          >
            {clip(company, COMPANY_MAX)}
          </div>
          <div
            style={{ display: "flex", width: 72, height: 8, borderRadius: 8, background: accent }}
          />
        </div>
      </div>
      <PreviewText
        segments={[{ text: "invited you to" }, { text: "review", highlight: true }]}
        style={{
          marginTop: 36,
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: -0.5,
          lineHeight: 1.2,
          color: PREVIEW_COLORS.muted,
        }}
      />
      <div
        style={{
          display: "flex",
          marginTop: 16,
          maxWidth: 620,
          fontSize: size,
          fontWeight: 800,
          letterSpacing: -size / 32,
          lineHeight: 1.04,
          color: PREVIEW_COLORS.ink,
          // Project names are often URLs or slugs with no spaces.
          wordBreak: "break-word",
        }}
      >
        {name}
      </div>
    </PreviewFrame>
  );
}
