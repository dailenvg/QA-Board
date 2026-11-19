import { betterAuth } from "better-auth";
import { PostgresDialect } from "kysely";
import type { Database } from "../db/database";
import { databasePool } from "../db/database-pool";
import { authSecret } from "./auth-secret";
import { authOrigin } from "./auth-url";
import { describeError, LoggableError } from "./http";
import { hashPassword, verifyPassword } from "./password";
import { isLocalHttp, SESSION_COOKIE, SESSION_TTL_MS } from "./session-cookie";
import { signSessionToken } from "./session-token";
import { atSignInTime, holdSessions } from "./sign-in-hold";
import { findSignInAccount, sessionUserOf, type SessionUser } from "./users";

/**
 * Better Auth, on Squint's own tables (048): `users`, `sessions`, and the
 * `auth_accounts` view over `users.password_hash`. Only ever called through
 * `auth.api` with headers built here: no HTTP handler is mounted, so it adds
 * no public routes, and Better Auth's own messages never reach a response.
 * Never call it inside a `db.transaction`: it queries on its own, and would
 * wait on rows that transaction holds.
 */

/** Sessions slide to 30 days from their last use, written at most once a day. */
const SESSION_UPDATE_AGE_S = 24 * 60 * 60;

/** Logs Better Auth's errors as Squint logs its own: the message, and only the kind of each error. */
function logAuthError(_level: string, message: string, ...args: unknown[]): void {
  const kinds = args.map(describeError).join(", ");
  console.error(`squint auth: ${message}${kinds ? ` (${kinds})` : ""}`);
}

function createAuth(db: Database) {
  const origin = authOrigin();
  return betterAuth({
    appName: "Squint",
    baseURL: origin.origin,
    // As a list, so a BETTER_AUTH_SECRETS in the environment can't stand in for Squint's key.
    secrets: [{ version: 0, value: authSecret() }],
    // Built from a database already connected and migrated: the pool is only opened on first use.
    database: {
      dialect: new PostgresDialect({ pool: () => Promise.resolve(databasePool(db)) }),
      type: "postgres",
      transaction: true,
    },
    telemetry: { enabled: false },
    rateLimit: { enabled: false },
    logger: { level: "error", log: logAuthError },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
    },
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      additionalFields: {
        role: { type: "string", input: false },
        deletedAt: { type: "date", required: false, input: false, fieldName: "deleted_at" },
      },
    },
    session: {
      modelName: "sessions",
      expiresIn: SESSION_TTL_MS / 1000,
      updateAge: SESSION_UPDATE_AGE_S,
      fields: {
        token: "token_hash",
        userId: "user_id",
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
      },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    advanced: {
      // One query per session read (sessions joined to users), as before Better Auth.
      database: { generateId: "uuid", validateSchema: false, joins: true },
      // The cookie keeps its name: no `__Secure-` prefix, Secure set as Squint always has.
      useSecureCookies: false,
      cookies: { session_token: { name: SESSION_COOKIE } },
      defaultCookieAttributes: { secure: !isLocalHttp(origin), sameSite: "lax", httpOnly: true },
    },
    databaseHooks: { session: { create: { before: holdSessions(db) } } },
  });
}

type Auth = ReturnType<typeof createAuth>;

const instances = new WeakMap<Database, Auth>();

/** Better Auth on `db`, made once per database (one in the app; one per test database). */
export function authFor(db: Database): Auth {
  let auth = instances.get(db);
  if (!auth) {
    auth = createAuth(db);
    instances.set(db, auth);
  }
  return auth;
}

/** What Better Auth is told of a request: the session cookie and who's asking, nothing else. */
interface Caller {
  /** A `Cookie` header from `authCookieHeader`. */
  cookie?: string;
  userAgent?: string | null;
  ip?: string;
}

function callerHeaders({ cookie, userAgent, ip }: Caller): Headers {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (userAgent) headers.set("user-agent", userAgent);
  if (ip) headers.set("x-forwarded-for", ip);
  return headers;
}

/**
 * The user `cookie` is signed in as, or null for no live session or a deleted
 * user. Use slides the session's expiry (`SESSION_UPDATE_AGE_S`).
 */
export async function findSessionUser(db: Database, cookie: string): Promise<SessionUser | null> {
  const session = await authFor(db).api.getSession({
    headers: callerHeaders({ cookie }),
    query: { disableCookieCache: true },
  });
  return session ? sessionUserOf(session.user) : null;
}

/** Ends the session behind `cookie`; who it was signed in as, or null when there was none. */
export async function endSession(db: Database, cookie: string): Promise<SessionUser | null> {
  const auth = authFor(db);
  const headers = callerHeaders({ cookie });
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  await auth.api.signOut({ headers });
  return session ? sessionUserOf(session.user) : null;
}

/** Who starts a session, kept with it; null for what isn't known. */
interface SessionCaller {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Starts a session for `userId` through Better Auth, at `now` for the sign-in
 * hold (`holdSessions`, which throws for an account that can't sign in), and
 * returns the session cookie's value, signed. Never inside a
 * `db.transaction`: call it once the change behind the session has committed.
 */
export async function startSession(
  db: Database,
  userId: string,
  now: number,
  { ip, userAgent }: SessionCaller = {},
): Promise<string> {
  const { internalAdapter } = await authFor(db).$context;
  const session = await atSignInTime(now, () =>
    internalAdapter.createSession(userId, false, {
      ipAddress: ip || null,
      userAgent: userAgent || null,
    }),
  );
  if (!session) throw new LoggableError("Better Auth started no session");
  return signSessionToken(session.token, authSecret());
}

/** Ends every session of `userId` ("log out everywhere"). Never inside a `db.transaction`. */
export async function endUserSessions(db: Database, userId: string): Promise<void> {
  const { internalAdapter } = await authFor(db).$context;
  await internalAdapter.deleteUserSessions(userId);
}

/**
 * Checks `email` (normalized) and `password` and starts a session, at `now`
 * for the sign-in hold. The password is checked here, as before Better Auth,
 * so every email Squint accepts can sign in (Better Auth's own sign-in
 * refuses some, such as `jürgen@firma.de`); an unknown email is checked
 * against the dummy hash, so it takes as long as a wrong password. Better
 * Auth then starts the session (`startSession`). The session cookie's value
 * and its user; null for a wrong email or password.
 */
export async function signInWithPassword(
  db: Database,
  credentials: { email: string; password: string },
  caller: { ip: string; userAgent?: string | null },
  now: number,
): Promise<{ token: string; user: SessionUser } | null> {
  const account = await findSignInAccount(db, credentials.email);
  const matches = await verifyPassword(credentials.password, account?.passwordHash ?? null);
  if (!account || !matches) return null;
  const token = await startSession(db, account.id, now, caller);
  // The hold lets no deleted user through, and `users.role` allows only Squint's roles.
  const user = sessionUserOf(account);
  if (!user) throw new LoggableError("signed in with no user");
  return { token, user };
}
