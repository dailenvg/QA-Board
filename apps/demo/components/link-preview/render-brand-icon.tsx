import { ImageResponse } from "next/og";
import { AVATAR_TILE } from "@/lib/avatar/default-avatar";
import { PAPER } from "@/lib/brand-palette";
import { companyMarkUri } from "./company-mark-uri";
import { linkPreviewFonts } from "./link-preview-fonts";

/** Big enough for an Apple touch icon; link previews and inboxes scale it down. */
export const BRAND_ICON_SIZE = 192;

/** How long a browser keeps a link's icon, whatever its `?v=`. */
const LINK_ICON_CACHE = "private, max-age=300";

/** The company's logo filling the square, on paper behind any transparency. */
function LogoIcon({ uri }: { uri: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only. */}
      <img
        src={uri}
        alt=""
        width={BRAND_ICON_SIZE}
        height={BRAND_ICON_SIZE}
        style={{ objectFit: "cover" }}
      />
    </div>
  );
}

/**
 * The company's default mark (a building on a gray bubble) on its own light
 * square, so it needs no dark edge.
 */
function DefaultIcon() {
  const uri = companyMarkUri({ size: BRAND_ICON_SIZE, tile: AVATAR_TILE });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only.
    <img src={uri} alt="" width={BRAND_ICON_SIZE} height={BRAND_ICON_SIZE} />
  );
}

/** The company behind a link, as its card reads it. */
interface IconSource {
  color: string | null;
  /** The logo as a data URI the renderer can draw; null for the default mark. */
  logoUri: string | null;
}

/**
 * A company icon as a square PNG (a review link's, a project link's, the
 * app's badge, an invite email's): the logo when the renderer can draw it
 * (PNG, JPEG or GIF), the company's default mark otherwise. Null without a
 * company (an anonymous link, or one that doesn't open). `cacheControl`
 * replaces the links' five private minutes.
 */
export async function renderBrandIcon(
  card: IconSource | null,
  { cacheControl = LINK_ICON_CACHE }: { cacheControl?: string } = {},
): Promise<ImageResponse | null> {
  if (!card) return null;
  const icon = card.logoUri ? <LogoIcon uri={card.logoUri} /> : <DefaultIcon />;
  return new ImageResponse(icon, {
    width: BRAND_ICON_SIZE,
    height: BRAND_ICON_SIZE,
    fonts: await linkPreviewFonts(),
    headers: { "cache-control": cacheControl },
  });
}
