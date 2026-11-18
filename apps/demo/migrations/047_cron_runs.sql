-- The daily cleanup's runs (Milestone 4, admin panel: the System and Storage pages).
--
-- `cron_runs`: one row per run of the cleanup (`lib/cron/run-expiry.ts`), whether Vercel Cron
-- started it (`schedule`) or the Squint admin did from the Storage page (`admin`). A run is
-- claimed under an advisory lock before it starts: while a row started less than 2 minutes ago is
-- still unfinished, another run is refused, so the admin's Run sweep and the schedule never
-- overlap. An unfinished row older than that never blocks (a run stops within 60 seconds, so it
-- died first); the System page shows it as "Didn't finish".
--
-- `finished_at`, `done`, `failed` and `counts` stay null while the run goes on, then are set
-- together: `done` is false when the time budget ran out or a step failed (the next run carries
-- on), `failed` is true when any step failed. `counts` holds each step's count by its name (null
-- when the step was skipped or failed) under `steps`, and the names of the steps that failed under
-- `failed`: counts and step names only, never an id, a URL or an error's message. Each run deletes
-- the rows that started more than 90 days before it.
--
-- A new table: nothing is rewritten. Safe to run more than once.

CREATE TABLE IF NOT EXISTS cron_runs (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger      text        NOT NULL CHECK (trigger IN ('schedule', 'admin')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  done         boolean,
  failed       boolean,
  counts       jsonb
);

CREATE INDEX IF NOT EXISTS cron_runs_started_idx ON cron_runs (started_at DESC);
