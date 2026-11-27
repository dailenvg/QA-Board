-- Where a project stands, as the team says by hand (`stage`): 'open-for-review' (With client),
-- 'editing', 'on-hold' or 'approved'. Null is no stage, which is where every project starts; any
-- member sets or clears it (lib/workspace/projects.ts), and each change is audited
-- (`project.stage_changed`). It sits beside the status, which is never stored: the stage is what
-- a person says, the status what the comments say. `stage_changed_at` is when the stage last
-- changed, and setting the same stage again leaves it as it was.
--
-- The stage is the team's only: review links never carry it.
--
-- No backfill: existing projects have no stage. Nullable without a default, so nothing is
-- rewritten; adding the CHECK reads the table once. Safe to run more than once.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_stage_check' AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_stage_check
      CHECK (stage IN ('open-for-review', 'editing', 'on-hold', 'approved'));
  END IF;
END;
$$;
