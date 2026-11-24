-- Replies on a review link, a thread under each of its comments, like the workspace's (053).
-- The owner's push brings the team's replies ('owner'); a guest's are 'client' and only the owner
-- pulls them. A table of its own, not inside a comment's `data`: the push replaces the owner's rows
-- whole, and a client's reply must outlive that.
--
-- Keyed like the link's comments: ids are unique within the link, and a reply belongs to one of
-- its comments (`comment_id`), so deleting the comment, or the link, deletes its replies. `data`
-- is the reply as the link shows it: {id, commentId, body, author, createdAt, editedAt?}. `seq`
-- comes from the same sequence as the link's comments and snapshots, so one pull cursor covers
-- all three. `client_info` is the browser a guest posted from, as on the link's comments (052): a
-- column, never in `data`, so the manifest's digest and the guest's view never have it. Owner
-- rows never have one.
--
-- No pending, claim or edit-key columns: a reply has no image to wait for, and guests don't edit
-- replies. Safe to run more than once.

CREATE TABLE IF NOT EXISTS squint_share_replies (
  share_id     text   NOT NULL,
  comment_id   text   NOT NULL,
  id           text   NOT NULL,
  data         jsonb  NOT NULL,
  origin       text   NOT NULL CONSTRAINT squint_share_replies_origin_check
                      CHECK (origin IN ('owner', 'client')),
  seq          bigint NOT NULL DEFAULT nextval('squint_share_seq'),
  client_info  jsonb  CONSTRAINT squint_share_replies_client_info_object
                      CHECK (client_info IS NULL OR jsonb_typeof(client_info) = 'object'),
  PRIMARY KEY (share_id, id),
  FOREIGN KEY (share_id, comment_id) REFERENCES squint_share_comments (share_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS squint_share_replies_seq_idx ON squint_share_replies (share_id, seq);
