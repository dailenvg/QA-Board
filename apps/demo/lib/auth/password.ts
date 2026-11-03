import { hash, verify } from "@node-rs/argon2";

/**
 * OWASP's Argon2id baseline: 19 MiB, 2 passes, 1 lane. Argon2id is the
 * library's default algorithm (a test checks the stored prefix).
 */
export const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/**
 * An Argon2id hash of 32 random bytes nobody kept. Signing in as an unknown
 * email verifies against it, so that takes as long as a wrong password does
 * and the timing doesn't reveal which emails have accounts.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$i0jBwFmEwOsTlBap1zLo8w$6eDefhFhGj4ZeYRpYx6hiF0YrZz5uZKIjFL6F0/c4uU";

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Whether `password` matches `storedHash`. With no stored hash (no such user)
 * it still does the work, against `DUMMY_HASH`, and answers false. A malformed
 * stored hash also answers false rather than throwing.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null,
): Promise<boolean> {
  try {
    const matches = await verify(storedHash ?? DUMMY_HASH, password);
    return storedHash !== null && matches;
  } catch {
    return false;
  }
}
