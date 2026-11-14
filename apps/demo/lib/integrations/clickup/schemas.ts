import { z } from "zod";
import { cleanNote, FOLLOWERS_MAX, NOTE_MAX, noteLength } from "./message";
import { CLICKUP_TOKEN_SHAPE, cleanClickUpToken } from "./token-shape";

/**
 * `POST .../integrations/clickup`: a personal token, and which of its ClickUp
 * workspaces to connect (left out the first time; needed when it reaches several).
 */
export const clickUpConnectSchema = z.object({
  token: z
    .string()
    .max(200)
    .transform(cleanClickUpToken)
    .pipe(z.string().regex(CLICKUP_TOKEN_SHAPE)),
  teamId: z.string().min(1).max(64).optional(),
});

export type ClickUpConnectInput = z.infer<typeof clickUpConnectSchema>;

/** A ClickUp id as Squint passes it on: letters, digits and the separators ClickUp's ids use. */
const clickUpIdField = z.string().regex(/^[A-Za-z0-9_:.-]{1,64}$/);

/**
 * `POST .../projects/<id>/clickup`: the channel, an optional note (cleaned,
 * at most `NOTE_MAX` characters once it is), who it's assigned to, and up to
 * `FOLLOWERS_MAX` followers (duplicates dropped). The message itself is
 * built on the server, from the project.
 */
export const clickUpSendSchema = z.object({
  channelId: clickUpIdField,
  note: z
    .string()
    .max(NOTE_MAX * 4)
    .default("")
    .refine((note) => noteLength(note) <= NOTE_MAX)
    .transform(cleanNote),
  assignee: clickUpIdField.nullish().transform((id) => id ?? null),
  followers: z
    .array(clickUpIdField)
    .max(FOLLOWERS_MAX * 2)
    .default([])
    .transform((ids) => [...new Set(ids)])
    .pipe(z.array(z.string()).max(FOLLOWERS_MAX)),
});

export type ClickUpSendInput = z.infer<typeof clickUpSendSchema>;
