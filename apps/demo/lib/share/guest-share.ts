import { cache } from "react";
import type { Invitation } from "../link-preview";
import { toClientBrand } from "./brand";
import { cardLogoUri, readBrandLogo } from "./brand-logo";
import { verifyGuestPass } from "./guest-pass";
import { shareServices } from "./server";
import { clientShare, clientView } from "./service";
import type { ClientBrand, ClientView } from "./types";

/**
 * What a guest's link opens to: the review, or, on a password-protected link
 * without a valid guest pass, only that it's locked and whose it is (the
 * brand). `passwordProtected` says whether the link has a password at all.
 */
export type GuestShare =
  | { locked: false; view: ClientView; passwordProtected: boolean }
  | { locked: true; brand: ClientBrand };

/**
 * What a guest's link opens at this moment, for a request carrying
 * `cookieHeader`, or null when its token is unknown, revoked or expired, or
 * its project is in the trash, or its workspace is archived or waiting to be
 * deleted. Read once per request: the page and its metadata both ask.
 */
export const openGuestShare = cache(
  async (token: string, cookieHeader: string | null): Promise<GuestShare | null> => {
    const { store } = await shareServices();
    const now = Date.now();
    const share = await clientShare(store, token, now);
    if (!share) return null;
    if (!verifyGuestPass(cookieHeader, share, now)) {
      return { locked: true, brand: toClientBrand(await store.brandOf(share.id)) };
    }
    const view = await clientView(store, share);
    return { locked: false, view, passwordProtected: share.password !== null };
  },
);

/**
 * Who invites to review what; null on an anonymous share, which keeps the
 * generic preview. A password-protected link never names its project, pass
 * or not: its preview is for whoever the link reaches.
 */
export function invitationOf(guest: GuestShare | null): Invitation | null {
  if (!guest) return null;
  const brand = guest.locked ? guest.brand : guest.view.brand;
  if (!brand.custom) return null;
  const project = guest.locked || guest.passwordProtected ? null : guest.view.project.name;
  return { company: brand.name, project };
}

export interface InvitationCard extends Invitation {
  color: string | null;
  /** The logo as a data URI the card can draw; null when there's none or it can't. */
  logoUri: string | null;
}

/**
 * The link preview card of a workspace's link; null for an anonymous one or
 * one that doesn't open. A password-protected link's card names the company only.
 */
export async function invitationCard(token: string): Promise<InvitationCard | null> {
  const { store } = await shareServices();
  const share = await clientShare(store, token, Date.now());
  if (!share) return null;
  const brand = await store.brandOf(share.id);
  if (!brand.custom) return null;
  const logo = brand.logoKey ? await readBrandLogo(store, share.id) : null;
  return {
    company: brand.name,
    project: share.password ? null : share.project.name,
    color: brand.color,
    logoUri: logo && cardLogoUri(logo),
  };
}
