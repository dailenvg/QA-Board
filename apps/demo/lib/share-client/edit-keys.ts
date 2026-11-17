/**
 * The edit keys this browser got for its own comments on one review link
 * (4.12): the server sends each once, in the answer to posting the comment,
 * and only this browser can then change that comment's words. Kept in
 * localStorage per link, next to the reviewer's name; another browser, or
 * cleared or blocked storage, has none, and so shows no Edit.
 */
export interface EditKeyMemory {
  /** The comment ids this browser holds a key for; empty when storage is blocked. */
  ids: () => string[];
  keyOf: (commentId: string) => string | null;
  save: (commentId: string, key: string) => void;
}

/** Where a link's keys are kept, as `squint:draft:<token>` keeps its draft. */
export const editKeysName = (token: string) => `squint:edit-keys:${token}`;

/** Only well-formed entries: a comment id to a 43-character key. */
function parseKeys(stored: string | null): Record<string, string> {
  if (!stored) return {};
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && /^[A-Za-z0-9_-]{43}$/.test(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

/** The link `token`'s keys in `storage` (localStorage by default, read when used). */
export function linkEditKeys(
  token: string,
  storage: () => Pick<Storage, "getItem" | "setItem"> = () => localStorage,
): EditKeyMemory {
  const name = editKeysName(token);
  const read = () => {
    try {
      return parseKeys(storage().getItem(name));
    } catch {
      // Storage blocked: no keys, so no Edit.
      return {};
    }
  };
  return {
    ids: () => Object.keys(read()),
    keyOf: (commentId) => read()[commentId] ?? null,
    save(commentId, key) {
      try {
        storage().setItem(name, JSON.stringify({ ...read(), [commentId]: key }));
      } catch {
        // Storage blocked or full: the comment is posted, just not editable from here.
      }
    },
  };
}
