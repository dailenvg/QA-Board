import type { SessionUser } from "@/lib/auth/users";

/** Who share-creating route tests are signed in as (the session itself isn't under test there). */
export const SIGNED_IN_USER: SessionUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "owner@acme.test",
  name: null,
  role: "company",
};

/** Whether `apiSignedIn` finds a session; tests flip it to check the 401. */
export const session = { signedIn: true };

/**
 * A stand-in for `@/lib/auth/guards` in route tests without a database:
 * `vi.mock("@/lib/auth/guards", () => import("@/test/signed-in").then((m) => m.signedInGuards))`.
 */
export const signedInGuards = {
  apiSignedIn: () =>
    Promise.resolve(
      session.signedIn
        ? { ok: true as const, user: SIGNED_IN_USER }
        : {
            ok: false as const,
            response: Response.json({ error: "unauthenticated" }, { status: 401 }),
          },
    ),
};
