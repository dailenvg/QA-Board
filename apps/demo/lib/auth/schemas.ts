import { z } from "zod";
import { isSecretShape } from "../share/tokens";
import {
  EMAIL_MAX_LENGTH,
  emailError,
  newPasswordError,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
} from "./field-rules";

/** Any email-ish string: an unknown or malformed one simply fails to sign in. */
const loginEmail = z.string().max(EMAIL_MAX_LENGTH).transform(normalizeEmail);

const email = z
  .string()
  .refine((value) => emailError(value) === null, "invalid email")
  .transform(normalizeEmail);

const newPassword = z.string().refine((value) => newPasswordError(value) === null, "weak password");

const secret = z.string().refine(isSecretShape, "invalid token");

export const loginSchema = z.object({
  email: loginEmail.pipe(z.string().min(1)),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const resetRequestSchema = z.object({ email });

export const resetCompleteSchema = z.object({ token: secret, password: newPassword });
