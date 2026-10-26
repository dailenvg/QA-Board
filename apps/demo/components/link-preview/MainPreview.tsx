import { PreviewFrame } from "./PreviewFrame";
import { PreviewIcon } from "./PreviewIcon";
import { PreviewPin } from "./PreviewPin";
import { PreviewSquiggy } from "./PreviewSquiggy";
import { PreviewText } from "./PreviewText";
import { PREVIEW_COLORS, PREVIEW_PIN_SIZES, PREVIEW_PINS } from "./preview-theme";

const { pink, orange, cyan, resolved } = PREVIEW_PINS;
const { lead, mid, small } = PREVIEW_PIN_SIZES;

function Art() {
  return (
    <>
      <div style={{ position: "absolute", left: 32, top: 128, display: "flex" }}>
        <PreviewSquiggy pose="idle" size={340} />
      </div>
      <PreviewPin fill={pink.hex} ink={pink.ink} size={lead} left={112} top={104}>
        1
      </PreviewPin>
      <PreviewPin fill={cyan.hex} ink={cyan.ink} size={small} left={264} top={96}>
        2
      </PreviewPin>
      <PreviewPin fill={orange.hex} ink={orange.ink} size={mid} left={320} top={200}>
        3
      </PreviewPin>
      <PreviewPin fill={resolved.hex} ink={resolved.ink} size={small} left={56} top={360}>
        <PreviewIcon name="check" color={resolved.ink} size={small / 2} />
      </PreviewPin>
    </>
  );
}

/** The main Squint card: the wordmark, one line, and Squiggy among review pins. */
export function MainPreview() {
  return (
    <PreviewFrame art={<Art />}>
      <div
        style={{
          display: "flex",
          fontSize: 188,
          fontWeight: 800,
          letterSpacing: -7,
          lineHeight: 0.9,
          color: PREVIEW_COLORS.ink,
        }}
      >
        Squint
      </div>
      <PreviewText
        segments={[
          { text: "Pin feedback", highlight: true },
          { text: "on any website, image or PDF." },
        ]}
        style={{
          marginTop: 40,
          maxWidth: 540,
          fontSize: 48,
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: -0.5,
          color: PREVIEW_COLORS.muted,
        }}
      />
    </PreviewFrame>
  );
}
