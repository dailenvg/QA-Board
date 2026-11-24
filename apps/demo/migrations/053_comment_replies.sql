-- Replies to a comment, a thread under its pin. Keyed like comments (018): ids come from the
-- browser and are unique within their project, so a reply belongs to (`project_id`,
-- `comment_id`), and deleting the comment deletes its replies. That cascade also covers deleting
-- the project, purging the workspace, and removing the page or snapshot the comment sat on. A
-- trashed project's replies stay with it: reads skip projects in the trash, as for comments.
--
-- `author_user_id` is set for workspace members (null for guests, and once the account is
-- deleted), and reads show the member's name as it is now, `author_name` standing in once the
-- account has none. `origin` says who it came from for good, as on comments (031): 'team' or
-- 'client' (a guest's, from the review link). `client_info` is the browser it was posted from, as
-- on comments (052). `edited_at` is set only when an edit changes the words (as 042).
--
-- No status, priority or `updated_at`: a reply is resolved with its comment, and never reopens it.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS comment_replies (
  project_id      text        NOT NULL,
  comment_id      text        NOT NULL,
  id              text        NOT NULL,
  body            text        NOT NULL,
  author_name     text        NOT NULL,
  author_user_id  uuid        REFERENCES users (id) ON DELETE SET NULL,
  origin          text        NOT NULL CONSTRAINT comment_replies_origin_check
                              CHECK (origin IN ('team', 'client')),
  client_info     jsonb       CONSTRAINT comment_replies_client_info_object
                              CHECK (client_info IS NULL OR jsonb_typeof(client_info) = 'object'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  edited_at       timestamptz,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id, comment_id) REFERENCES comments (project_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS comment_replies_thread_idx
  ON comment_replies (project_id, comment_id, created_at);
