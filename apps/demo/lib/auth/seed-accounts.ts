import { z } from "zod";
import type { Queryable } from "../share/migrate";
import { emailError, newPasswordError, normalizeEmail } from "./field-rules";
import { hashPassword } from "./password";
import type { UserRole } from "./users";

/** The admin, the company workspace and its owner, from the seed variables. */
export interface SeedInput {
  admin: { email: string; password: string };
  company: { slug: string; name: string; email: string; password: string };
}

export type SeedOutcome = "created" | "kept";

export interface SeedReport {
  admin: SeedOutcome;
  workspace: SeedOutcome;
  company: SeedOutcome;
  /** "created" when the company user became the workspace's owner on this run. */
  owner: SeedOutcome;
}

/** A refusal whose message is safe to print: names and emails, never passwords. */
export class SeedError extends Error {
  override name = "SeedError";
}

const email = z
  .string()
  .refine((value) => emailError(value) === null, "must be an email address")
  .transform(normalizeEmail);
const password = z
  .string()
  .refine((value) => newPasswordError(value) === null, "must be 12 to 256 characters");

const seedEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "is required"),
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: password,
  COMPANY_SLUG: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase letters, digits and single hyphens")
    .max(48, "must be at most 48 characters"),
  COMPANY_NAME: z.string().trim().min(1, "is required").max(80, "must be at most 80 characters"),
  COMPANY_EMAIL: email,
  COMPANY_PASSWORD: password,
});

export type SeedEnvResult =
  { ok: true; databaseUrl: string; input: SeedInput } | { ok: false; problems: string[] };

/** Reads and checks the seed variables. Problems name the variable, never its value. */
export function seedInputFromEnv(env: Readonly<Record<string, string | undefined>>): SeedEnvResult {
  const parsed = seedEnvSchema.safeParse(env);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => {
        const name = String(issue.path[0]);
        return env[name] === undefined ? `${name} is required` : `${name} ${issue.message}`;
      }),
    };
  }
  const value = parsed.data;
  if (value.ADMIN_EMAIL === value.COMPANY_EMAIL) {
    return { ok: false, problems: ["ADMIN_EMAIL and COMPANY_EMAIL must differ"] };
  }
  return {
    ok: true,
    databaseUrl: value.DATABASE_URL,
    input: {
      admin: { email: value.ADMIN_EMAIL, password: value.ADMIN_PASSWORD },
      company: {
        slug: value.COMPANY_SLUG,
        name: value.COMPANY_NAME,
        email: value.COMPANY_EMAIL,
        password: value.COMPANY_PASSWORD,
      },
    },
  };
}

async function audit(db: Queryable, action: string, targetType: string, targetId: string) {
  await db.query(
    "INSERT INTO audit_log (action, target_type, target_id, meta) VALUES ($1, $2, $3, $4::jsonb)",
    [action, targetType, targetId, JSON.stringify({ source: "seed-accounts" })],
  );
}

/**
 * The user with `email`, created with `role` and a hash of `password` when
 * missing. An existing user is kept as it is: its password hash is never
 * overwritten (reset it from /admin or by email instead).
 */
async function ensureUser(
  db: Queryable,
  user: { email: string; password: string },
  role: UserRole,
  hash: (password: string) => Promise<string>,
): Promise<{ id: string; outcome: SeedOutcome }> {
  const { rows } = await db.query<{ id: string; role: UserRole; deleted_at: Date | null }>(
    "SELECT id, role, deleted_at FROM users WHERE email = $1",
    [user.email],
  );
  const existing = rows[0];
  if (existing) {
    if (existing.role !== role) {
      throw new SeedError(`${user.email} already exists as ${existing.role}, not ${role}`);
    }
    if (existing.deleted_at) throw new SeedError(`${user.email} exists but is deleted`);
    return { id: existing.id, outcome: "kept" };
  }
  const inserted = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
    [user.email, await hash(user.password), role],
  );
  const id = inserted.rows[0]?.id ?? "";
  await audit(db, "seed.user_created", "user", id);
  return { id, outcome: "created" };
}

async function ensureWorkspace(
  db: Queryable,
  slug: string,
  name: string,
): Promise<{ id: string; outcome: SeedOutcome }> {
  const inserted = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id",
    [slug, name],
  );
  const created = inserted.rows[0]?.id;
  if (created) {
    await audit(db, "seed.workspace_created", "workspace", created);
    return { id: created, outcome: "created" };
  }
  const { rows } = await db.query<{ id: string }>("SELECT id FROM workspaces WHERE slug = $1", [
    slug,
  ]);
  return { id: rows[0]?.id ?? "", outcome: "kept" };
}

/** Makes `userId` the workspace's owner, unless someone else already is. */
async function ensureOwner(db: Queryable, workspaceId: string, userId: string, slug: string) {
  const { rows } = await db.query<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner'",
    [workspaceId],
  );
  const owner = rows[0]?.user_id;
  if (owner === userId) return "kept";
  if (owner) throw new SeedError(`workspace ${slug} already has a different owner`);
  await db.query(
    `INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = 'owner'`,
    [userId, workspaceId],
  );
  await audit(db, "seed.owner_linked", "workspace", workspaceId);
  return "created";
}

/**
 * Creates whatever is missing of: the admin user, the company workspace, the
 * company user, and its ownership of the workspace. Idempotent: a second run
 * changes nothing and never touches an existing password. One transaction, so
 * `db` must be a single connection (a `pg.Client`, not a pool).
 */
export async function seedAccounts(
  db: Queryable,
  input: SeedInput,
  hash: (password: string) => Promise<string> = hashPassword,
): Promise<SeedReport> {
  await db.query("BEGIN");
  try {
    const admin = await ensureUser(db, input.admin, "admin", hash);
    const workspace = await ensureWorkspace(db, input.company.slug, input.company.name);
    const company = await ensureUser(db, input.company, "company", hash);
    const owner = await ensureOwner(db, workspace.id, company.id, input.company.slug);
    await db.query("COMMIT");
    return {
      admin: admin.outcome,
      workspace: workspace.outcome,
      company: company.outcome,
      owner,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
