import { z } from "zod";
import { emailError, newPasswordError, normalizeEmail } from "../auth/field-rules";
import { isSecretShape } from "../share/tokens";
import { currentPasswordError, displayNameError } from "./field-rules";

/** What the account routes accept. Never a user id: the routes act on the session's user. */

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
