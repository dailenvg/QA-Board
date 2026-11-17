/** Header carrying the owner key on every owner route. */
export const OWNER_KEY_HEADER = "x-squint-owner-key";

/**
 * Header carrying a client comment's edit key (4.12), on its edit only. A
 * header, not the URL, so the key never lands in logs or history.
 */
export const EDIT_KEY_HEADER = "x-squint-edit-key";
