-- The pictures of a page-based project, in reading order, from the browser store's `Page`.
-- Page ids are unique within their project only (a migrated page is `page-1` everywhere), so
-- the key is (project_id, id). `position` is unique per project, checked at commit so a
-- reorder can swap positions in one transaction. `width` and `height` are null on pages
-- migrated from the browser's version 2, which never recorded them. Safe to run more than once.

CREATE TABLE IF NOT EXISTS pages (
  project_id  text    NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  id          text    NOT NULL,
  blob_key    text    NOT NULL,
  name        text    NOT NULL,
  width       integer CHECK (width > 0),
  height      integer CHECK (height > 0),
  rev         integer NOT NULL DEFAULT 0 CHECK (rev >= 0),
  position    integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (project_id, id),
  CONSTRAINT pages_position_key UNIQUE (project_id, position) DEFERRABLE INITIALLY DEFERRED
);
