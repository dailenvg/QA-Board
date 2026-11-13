/**
 * What a ClickUp personal API token looks like: `pk_`, the ClickUp user's id,
 * `_`, then 32 letters and digits. Checked in the browser as the field loses
 * focus and again on the server, before ClickUp is asked. No Node imports.
 */
export const CLICKUP_TOKEN_SHAPE = /^pk_\d+_[A-Za-z0-9]{32}$/;

/** The token as pasted, without the spaces or line breaks a copy can bring along. */
export function cleanClickUpToken(token: string): string {
  return token.replace(/\s+/g, "");
}

export function isClickUpTokenShape(token: string): boolean {
  return CLICKUP_TOKEN_SHAPE.test(cleanClickUpToken(token));
}
