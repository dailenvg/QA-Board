import { avatarShapes, avatarSvg, drawDefaultAvatar } from "@/lib/avatar/default-avatar";

interface CompanyMarkUriOptions {
  /** The square it fills, in px. */
  size: number;
  /** A background square in this color; null leaves it to whatever the image sits on. */
  tile: string | null;
}

/**
 * A company's default mark as an SVG data URI, for the server's images
 * (satori draws `<img>`, never SVG text): tile fit, so the bubble's tail
 * clears a rounded frame's corners, and no dark edge.
 */
export function companyMarkUri({ size, tile }: CompanyMarkUriOptions): string {
  const drawing = drawDefaultAvatar({
    kind: "company",
    size,
    fit: "tile",
    tile,
  });
  return `data:image/svg+xml;base64,${Buffer.from(avatarSvg(avatarShapes(drawing))).toString("base64")}`;
}
