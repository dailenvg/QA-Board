/**
 * How long an invite's email holds back a resend, shared by the server
 * (`resendInvite`) and the Members page, which greys Resend out for as long.
 * No server imports: the page bundles this.
 */

/** How soon after an email went out the same invite can be sent again. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
