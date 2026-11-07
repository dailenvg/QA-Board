-- A project can sit at the workspace root (`folder_id` null). Deleting a folder moves the
-- trashed projects inside it there, so they stay restorable for their grace period, and
-- restoring one brings it back at the root. The composite foreign key to folders skips rows
-- with a null folder_id, so a root project needs no folder. Safe to run more than once.

ALTER TABLE projects ALTER COLUMN folder_id DROP NOT NULL;
