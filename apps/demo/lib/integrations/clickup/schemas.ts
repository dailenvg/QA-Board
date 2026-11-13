import { z } from "zod";
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
