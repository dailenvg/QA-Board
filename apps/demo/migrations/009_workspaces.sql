-- A company's workspace: its folders, projects, comments and shares hang off it. Phase 1 has
-- one (ONE Agency, from the seed script). `slug` is a URL-safe handle; `brand_color`,
-- `logo_blob_key` and `from_email_name` white-label it (Milestone 2). Archiving keeps the
-- data but locks the workspace. Safe to run more than once.

CREATE TABLE IF NOT EXISTS workspaces (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 text        NOT NULL UNIQUE
                                   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 48),
  name                 text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  logo_blob_key        text,
  brand_color          text        CHECK (brand_color ~ '^#[0-9a-f]{6}$'),
  from_email_name      text,
  storage_quota_bytes  bigint      NOT NULL DEFAULT 5368709120 CHECK (storage_quota_bytes >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz
);
