import { cache } from "react";
import type { Invitation } from "../link-preview";
import { toClientBrand } from "./brand";
import { cardLogoUri, readBrandLogo } from "./brand-logo";
import { verifyGuestPass } from "./guest-pass";
import { shareServices } from "./server";
import { clientShare, clientView } from "./service";
import type { ClientView, LockedShare } from "./types";

/**
 * What a guest's link opens to: the review, or, on a password-protected link
 * without a valid guest pass, only that it's locked, whose it is (the brand)
 * and the project's name.
 */
export type GuestShare = { locked: false; view: ClientView } | ({ locked: true } & LockedShare);

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
      const brand = toClientBrand(await store.brandOf(share.id));
      return {
        locked: true,
        brand,
        projectName: share.project.name,
        clientName: share.clientName,
      };
    }
    return { locked: false, view: await clientView(store, share) };
  },
);

/**
 * Who invites whom to review what; null on an anonymous share, which keeps the
 * generic preview. Password-protected or not, locked or not, the same.
 */
export function invitationOf(guest: GuestShare | null): Invitation | null {
  if (!guest) return null;
  const brand = guest.locked ? guest.brand : guest.view.brand;
  if (!brand.custom) return null;
  const project = guest.locked ? guest.projectName : guest.view.project.name;
  const client = guest.locked ? guest.clientName : guest.view.clientName;
  return { company: brand.name, project, client };
}

export interface InvitationCard extends Invitation {
  color: string | null;
  /** The logo as a data URI the card can draw; null when there's none or it can't. */
  logoUri: string | null;
}

/**
 * The link preview card of a workspace's link, password-protected or not;
 * null for an anonymous one or one that doesn't open.
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
    project: share.project.name,
    client: share.clientName,
    color: brand.color,
    logoUri: logo && cardLogoUri(logo),
  };
}
