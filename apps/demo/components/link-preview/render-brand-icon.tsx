import { ImageResponse } from "next/og";
import { PAPER } from "@/lib/brand-palette";
import { monogram } from "@/lib/monogram";
import { invitationCard } from "@/lib/share/guest-share";
import { linkPreviewFonts } from "./link-preview-fonts";

/** Big enough for an Apple touch icon; link previews and inboxes scale it down. */
export const BRAND_ICON_SIZE = 192;

const ICON_HEADERS = { "cache-control": "private, max-age=300" };

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

/** The company's initials on its brand color (navy without one). */
function MonogramIcon({ company, color }: { company: string; color: string | null }) {
  const tile = monogram(company, color);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: tile.background,
        color: tile.ink,
        fontSize: 84,
        fontWeight: 800,
        letterSpacing: -2,
      }}
    >
      {tile.initials}
    </div>
  );
}

/**
 * A workspace link's company icon as a square PNG: the logo when the
 * renderer can draw it (PNG, JPEG or GIF), the monogram otherwise. Null for
 * an anonymous link or one that doesn't open.
 */
export async function renderBrandIcon(token: string): Promise<ImageResponse | null> {
  const card = await invitationCard(token);
  if (!card) return null;
  const icon = card.logoUri ? (
    <LogoIcon uri={card.logoUri} />
  ) : (
    <MonogramIcon company={card.company} color={card.color} />
  );
  return new ImageResponse(icon, {
    width: BRAND_ICON_SIZE,
    height: BRAND_ICON_SIZE,
    fonts: await linkPreviewFonts(),
    headers: ICON_HEADERS,
  });
}
