import { z } from "zod";
import { ClickUpError, clickUpId, requestClickUp, shownName, type Fetch } from "./api";

/**
 * ClickUp Chat (API v3): a ClickUp workspace's channels, and posting a
 * message to one. Direct messages and group DMs are left out: Squint only
 * posts where a team talks.
 */

/** A channel a message can go to. */
export interface ClickUpChannel {
  id: string;
  name: string;
}

/** A message for `postClickUpMessage`: Markdown, from `clickUpMessage`. */
export interface ClickUpMessage {
  content: string;
  /** A ClickUp user id. */
  assignee?: string;
  /** ClickUp user ids. */
  followers?: readonly string[];
}

/** What ClickUp says of a message it took: where it can be opened, when it says. */
export interface PostedMessage {
  url: string | null;
}

/** The most channels ClickUp sends per page. */
const PAGE_SIZE = 100;

/** Pages read at most, so a runaway cursor can't keep a request going. */
const MAX_PAGES = 10;

const channelsAnswer = z.object({
  data: z.array(z.unknown()),
  next_cursor: z.string().nullish(),
});

const channel = z.object({
  id: clickUpId,
  name: z.string().nullish(),
  type: z.string(),
  archived: z.boolean().nullish(),
  is_hidden: z.boolean().nullish(),
});

const postedAnswer = z.object({
  url: z.string().nullish(),
  link: z.string().nullish(),
});

const teamPath = (teamId: string) => `/v3/workspaces/${encodeURIComponent(teamId)}/chat/channels`;

/** A channel that takes a message: a channel (not a DM), neither archived nor hidden. */
function openChannel(entry: unknown): ClickUpChannel | null {
  const parsed = channel.safeParse(entry);
  if (!parsed.success) return null;
  const { id, name, type, archived, is_hidden: hidden } = parsed.data;
  if (type !== "CHANNEL" || archived || hidden) return null;
  return { id, name: shownName(name, `Channel ${id}`) };
}

/**
 * The open channels of the ClickUp workspace `teamId`, by name, read a page
 * at a time (`cursor` and `next_cursor`) up to `MAX_PAGES`. Entries in
 * another shape are left out rather than failing the list.
 */
export async function listClickUpChannels(
  apiUrl: string,
  token: string,
  teamId: string,
  fetcher: Fetch = fetch,
): Promise<ClickUpChannel[]> {
  const channels = new Map<string, ClickUpChannel>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set("cursor", cursor);
    const answer = await requestClickUp(
      apiUrl,
      token,
      { path: `${teamPath(teamId)}?${query.toString()}` },
      fetcher,
    );
    const parsed = channelsAnswer.safeParse(answer);
    if (!parsed.success) {
      throw new ClickUpError("GET /v3/workspaces/…/chat/channels answered in an unknown shape");
    }
    for (const entry of parsed.data.data) {
      const open = openChannel(entry);
      if (open) channels.set(open.id, open);
    }
    cursor = parsed.data.next_cursor || null;
    if (!cursor) break;
  }
  return [...channels.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** A link ClickUp gave, kept only when it's on ClickUp's own site over https. */
function clickUpLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.clickup.com" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Posts `message` to channel `channelId` of the ClickUp workspace `teamId`,
 * as the token's user. Answers the message's link when ClickUp gives one.
 */
export async function postClickUpMessage(
  apiUrl: string,
  token: string,
  target: { teamId: string; channelId: string },
  { content, assignee, followers }: ClickUpMessage,
  fetcher: Fetch = fetch,
): Promise<PostedMessage> {
  const answer = await requestClickUp(
    apiUrl,
    token,
    {
      method: "POST",
      path: `${teamPath(target.teamId)}/${encodeURIComponent(target.channelId)}/messages`,
      body: {
        type: "message",
        content,
        content_format: "text/md",
        ...(assignee ? { assignee } : {}),
        ...(followers?.length ? { followers: [...followers] } : {}),
      },
    },
    fetcher,
  );
  const body = (answer as { data?: unknown } | null)?.data ?? answer;
  const parsed = postedAnswer.safeParse(body);
  return { url: parsed.success ? clickUpLink(parsed.data.url ?? parsed.data.link) : null };
}
