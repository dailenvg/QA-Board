import { cache } from "react";
import type { Invitation } from "../link-preview";
import { toClientBrand } from "./brand";
import { cardLogoUri, readBrandLogo } from "./brand-logo";
import { verifyGuestPass } from "./guest-pass";
import { shareServices } from "./server";
import { clientShare, clientView, isPausedShare } from "./service";
import type { ClientBrand, ClientView, LockedShare } from "./types";

/**
 * What a guest's link opens to: the review, or, on a password-protected link
 * without a valid guest pass, only that it's locked, whose it is (the brand)
 * and the project's name.
 */
export type GuestShare = { locked: false; view: ClientView } | ({ locked: true } & LockedShare);

/**
 * What a guest's link opens at this moment, for a request carrying
 * `cookieHeader`, or null when its token is unknown, revoked or expired, or
 * its project is in the trash, or its workspace is archived, waiting to be
 * deleted or suspended. Read once per request: the page and its metadata both ask.
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
    return { locked: false, view: await clientView(store, share, token) };
  },
);

/**
 * Whether a link that doesn't open (`openGuestShare` is null) is only paused,
 * its workspace suspended by the Squint admin: the page then says the review
 * isn't available right now. Its metadata and preview card stay generic, as
 * for any link that doesn't open, so a preview never tells.
 */
export const isGuestSharePaused = cache(async (token: string): Promise<boolean> => {
  const { store } = await shareServices();
  return isPausedShare(store, token, Date.now());
});

/** The company behind a guest's link, locked or not. */
export function guestBrand(guest: GuestShare): ClientBrand {
  return guest.locked ? guest.brand : guest.view.brand;
}

/**
 * Who invites whom to review what; null on an anonymous share, which keeps the
 * generic preview. Password-protected or not, locked or not, the same.
 */
export function invitationOf(guest: GuestShare | null): Invitation | null {
  if (!guest) return null;
  const brand = guestBrand(guest);
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
 * null for an anonymous one or one that doesn't open (a paused one included).
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
