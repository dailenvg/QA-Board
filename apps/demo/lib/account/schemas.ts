import { z } from "zod";
import { emailError, newPasswordError, normalizeEmail } from "../auth/field-rules";
import { isSecretShape } from "../share/tokens";
import {
  brandColorError,
  currentPasswordError,
  displayNameError,
  normalizeSenderName,
  senderNameError,
  workspaceNameError,
} from "./field-rules";

/**
 * What the account routes accept. Never a user or workspace id: the routes act
 * on the session's user, and on the workspace the session's user belongs to.
 */

const displayName = z
  .string()
  .refine((value) => displayNameError(value) === null, "invalid name")
  .transform((value) => value.trim());

const currentPassword = z
  .string()
  .refine((value) => currentPasswordError(value) === null, "invalid password");

const newPassword = z.string().refine((value) => newPasswordError(value) === null, "weak password");

const email = z
  .string()
  .refine((value) => emailError(value) === null, "invalid email")
  .transform(normalizeEmail);

/** `PATCH /api/account/profile`. */
export const profileSchema = z.object({ name: displayName });

/** `POST /api/account/password`. */
export const passwordChangeSchema = z.object({ currentPassword, newPassword });

/** `POST /api/account/email`. */
export const emailChangeSchema = z.object({ currentPassword, newEmail: email });

/** `POST /api/auth/email-change/confirm`: the emailed link's token. */
export const emailConfirmSchema = z.object({
  token: z.string().refine(isSecretShape, "invalid token"),
});

const workspaceName = z
  .string()
  .refine((value) => workspaceNameError(value) === null, "invalid name")
  .transform((value) => value.trim());

/** `#rrggbb` (stored lowercase) that stands out on white; null for Squint's own. */
const brandColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "invalid color")
  .transform((value) => value.toLowerCase())
  .refine((value) => brandColorError(value) === null, "too light")
  .nullable();

const senderName = z
  .string()
  .nullable()
  .refine((value) => value === null || senderNameError(value) === null, "invalid sender name")
  .transform((value) => (value === null ? null : normalizeSenderName(value)));

/** `PATCH /api/account/workspace`: every field, as the form has them. */
export const workspaceSettingsSchema = z.object({
  name: workspaceName,
  brandColor,
  senderName,
});

export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;
