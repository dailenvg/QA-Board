-- When a comment's words last changed (`edited_at`), for its "Edited" line. `updated_at` can't say:
-- every change bumps it, a resolve, a reopen or the crop saved right after posting included, so
-- comments whose text never changed showed as edited. The app sets this only when an edit
-- carries different text (lib/workspace/comments.ts); status and crop changes never touch it.
--
-- No backfill: an older row can't tell a text edit from a crop or a status change, so every
-- existing comment starts with null (not edited). Imported comments get null too: a browser's
-- local data has no edit time.
--
-- Nullable without a default, so nothing is rewritten. Safe to run more than once.

ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at timestamptz;
