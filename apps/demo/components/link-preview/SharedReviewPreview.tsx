import { PAPER } from "@/lib/brand-palette";
import { PreviewFrame } from "./PreviewFrame";
import { PreviewIcon } from "./PreviewIcon";
import { PreviewLockup } from "./PreviewLockup";
import { PreviewPin } from "./PreviewPin";
import { PreviewSquiggy } from "./PreviewSquiggy";
import { PreviewText } from "./PreviewText";
import { PREVIEW_COLORS, PREVIEW_PIN_SIZES, PREVIEW_PINS } from "./preview-theme";

const { pink, orange } = PREVIEW_PINS;
const { lead, mid, small } = PREVIEW_PIN_SIZES;

function Art() {
  return (
    <>
      <div style={{ position: "absolute", left: 32, top: 128, display: "flex" }}>
        <PreviewSquiggy pose="welcome" size={340} />
      </div>
      <PreviewPin fill={pink.hex} ink={pink.ink} size={mid} left={248} top={88}>
        1
      </PreviewPin>
      <PreviewPin fill={orange.hex} ink={orange.ink} size={small} left={320} top={184}>
        2
      </PreviewPin>
      <PreviewPin fill={PREVIEW_COLORS.ink} ink={PAPER} size={lead} left={88} top={88}>
        <PreviewIcon name="plus" color={PAPER} size={lead / 2} />
      </PreviewPin>
    </>
  );
}

/**
 * The card for a shared review link. Generic by design: it never shows the
 * project, the client or the token, since unfurls are seen by whole channels.
 */
export function SharedReviewPreview() {
  return (
    <PreviewFrame art={<Art />}>
      <PreviewLockup size={60} />
      <PreviewText
        segments={[{ text: "You\u2019re invited to" }, { text: "review", highlight: true }]}
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
