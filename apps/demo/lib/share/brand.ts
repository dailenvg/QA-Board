import { createHash } from "node:crypto";
import type { ClientBrand } from "./types";

/**
 * The company behind a share, server-side: the name, brand color and logo of
 * the workspace the share belongs to (migration 009's white-label columns),
 * or Squint's own on an anonymous share. Only `toClientBrand` reaches a guest.
 */
export interface ShareBrand {
  /** False on an anonymous share (and in the memory store): Squint's own. */
  custom: boolean;
  name: string;
  /** `#rrggbb`, or null for the app's own accent. */
  color: string | null;
  /**
   * The logo's `workspace_blobs` key (`ws/<workspaceId>/brand/logo/<id>`), only
   * when that file is stored. Server-side only: it names the workspace.
   */
  logoKey: string | null;
}

export const SQUINT_BRAND: ShareBrand = {
  custom: false,
  name: "Squint",
  color: null,
  logoKey: null,
};

const BRAND_COLOR = /^#[0-9a-f]{6}$/;

/** A stored brand color as the guest may use it: `#rrggbb` (as 009 checks), else null. */
export function brandColor(value: string | null | undefined): string | null {
  const color = value?.trim().toLowerCase() ?? "";
  return BRAND_COLOR.test(color) ? color : null;
}

/**
 * A short fingerprint of the logo's key, for its URL's `?v=`: a new logo has a
 * new key, so browsers fetch it again. One-way, so it never reveals the key.
 */
export function logoVersion(logoKey: string): string {
  return createHash("sha256").update(logoKey).digest("hex").slice(0, 16);
}

/** What the guest may know of the brand: no ids, keys or paths. */
export function toClientBrand(brand: ShareBrand): ClientBrand {
  return {
    custom: brand.custom,
    name: brand.name,
    color: brand.color,
    hasLogo: brand.logoKey !== null,
    logoVersion: brand.logoKey === null ? null : logoVersion(brand.logoKey),
  };
}
