import { PAPER } from "@/lib/brand-palette";
import { PreviewIcon } from "./PreviewIcon";
import { PreviewPin } from "./PreviewPin";
import { PreviewSquiggy } from "./PreviewSquiggy";
import { PREVIEW_COLORS, PREVIEW_PIN_SIZES, PREVIEW_PINS } from "./preview-theme";

const { pink, orange } = PREVIEW_PINS;
const { lead, mid, small } = PREVIEW_PIN_SIZES;

/** Squiggy leaning in toward the words, among two comment pins and a new one being placed. */
export function SharedReviewArt() {
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
