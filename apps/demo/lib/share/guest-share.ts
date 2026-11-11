import { cache } from "react";
import type { Invitation } from "../link-preview";
import { cardLogoUri, readBrandLogo } from "./brand-logo";
import { shareServices } from "./server";
import { clientShare, clientView } from "./service";
import type { ClientView } from "./types";

/**
 * What a guest's link opens at this moment, or null when its token is
 * unknown, revoked or expired, or its project is in the trash, or its
 * workspace is archived or waiting to be deleted. Read once per request: the
 * page and its metadata both ask.
 */
export const openGuestShare = cache(async (token: string): Promise<ClientView | null> => {
  const { store } = await shareServices();
  const share = await clientShare(store, token, Date.now());
  return share && clientView(store, share);
});

/** Who invites to review what; null on an anonymous share, which keeps the generic preview. */
export function invitationOf(view: ClientView | null): Invitation | null {
  if (!view?.brand.custom) return null;
  return { company: view.brand.name, project: view.project.name };
}

export interface InvitationCard extends Invitation {
  color: string | null;
  /** The logo as a data URI the card can draw; null when there's none or it can't. */
  logoUri: string | null;
}

/** The link preview card of a workspace's link; null for an anonymous one or one that doesn't open. */
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
    color: brand.color,
    logoUri: logo && cardLogoUri(logo),
  };
}
