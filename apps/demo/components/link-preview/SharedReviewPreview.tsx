import { PreviewFrame } from "./PreviewFrame";
import { PreviewLockup } from "./PreviewLockup";
import { PreviewText } from "./PreviewText";
import { SharedReviewArt } from "./SharedReviewArt";
import { PREVIEW_COLORS } from "./preview-theme";

/**
 * The generic card for a shared review link: anonymous links, and any link
 * that doesn't open. It never shows the project, the client or the token.
 */
export function SharedReviewPreview() {
  return (
    <PreviewFrame art={<SharedReviewArt />}>
      <PreviewLockup size={60} />
      <PreviewText
        segments={[{ text: "You’re invited to" }, { text: "review", highlight: true }]}
        style={{
          marginTop: 40,
          maxWidth: 620,
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 1.02,
          color: PREVIEW_COLORS.ink,
        }}
      />
      <div
        style={{
          display: "flex",
          marginTop: 32,
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: PREVIEW_COLORS.muted,
        }}
      >
        Drop a pin, leave a comment.
      </div>
    </PreviewFrame>
  );
}
