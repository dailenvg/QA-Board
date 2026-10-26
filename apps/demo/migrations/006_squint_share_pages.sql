-- Shared image projects become page projects, like the browser's version 3 data: the image
-- becomes the project's one page, `page-1` (the id the browser gives a migrated image too, so
-- the owner's next push matches), its blob moves from the key `image` to `page:page-1`, and
-- comments that aren't on a snapshot are placed on that page. The project is converted last,
-- because the steps before it find their shares by the old shape. One query, so one
-- transaction. Safe to run more than once: every step only touches rows still in the old shape.

UPDATE squint_share_comments AS comment
SET data = comment.data || '{"pageId": "page-1"}'::jsonb
FROM squint_shares AS share
WHERE comment.share_id = share.id
  AND share.project #>> '{source,kind}' = 'image'
  AND NOT (comment.data ? 'snapshotId')
  AND NOT (comment.data ? 'pageId');

UPDATE squint_share_blobs AS blob
SET key = 'page:page-1'
FROM squint_shares AS share
WHERE blob.share_id = share.id
  AND share.project #>> '{source,kind}' = 'image'
  AND blob.key = 'image';

-- Parts of an unfinished upload of the old key: the owner's next push sends the page again.
DELETE FROM squint_share_blob_parts WHERE key = 'image';

UPDATE squint_shares
SET project = jsonb_set(
  project,
  '{source}',
  jsonb_strip_nulls(jsonb_build_object(
    'kind', 'pages',
    'origin', 'image',
    'fileName', project #> '{source,fileName}',
    'referenceUrl', project #> '{source,referenceUrl}',
    'pages', jsonb_build_array(
      jsonb_build_object('id', 'page-1', 'name', project #> '{source,fileName}')
    )
  ))
)
WHERE project #>> '{source,kind}' = 'image';
