/** Every statement is parameterised; nothing user-supplied is interpolated. */

const PIN_COLUMNS = `p.id, p.branch, p.path, p.deployment_url, p.deep_link, p.anchor, p.author,
  p.body, p.priority, p.screenshot_url, p.context, p.resolved, p.resolved_at, p.resolved_by,
  p.created_at`;

const SELECT_PINS = `SELECT ${PIN_COLUMNS},
  COALESCE(
    json_agg(
      json_build_object('id', r.id, 'author', r.author, 'body', r.body, 'createdAt', r.created_at)
      ORDER BY r.created_at, r.id
    ) FILTER (WHERE r.id IS NOT NULL),
    '[]'::json
  ) AS replies
FROM pinpoint_pins p
LEFT JOIN pinpoint_replies r ON r.pin_id = p.id`;

export const LIST_PINS = `${SELECT_PINS}
WHERE p.branch = $1 AND p.path = $2
GROUP BY p.id
ORDER BY p.created_at, p.id`;

export const GET_PIN = `${SELECT_PINS}
WHERE p.branch = $1 AND p.id = $2
GROUP BY p.id`;

export const INSERT_PIN = `INSERT INTO pinpoint_pins
  (id, branch, path, deployment_url, deep_link, anchor, author, body, priority, screenshot_url,
   context, created_at)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12)`;

export const INSERT_REPLY = `INSERT INTO pinpoint_replies (id, pin_id, author, body, created_at)
SELECT $1, p.id, $3, $4, $5 FROM pinpoint_pins p WHERE p.id = $2 AND p.branch = $6`;

export const RESOLVE_PIN = `UPDATE pinpoint_pins
SET resolved = true,
    resolved_at = COALESCE(resolved_at, $3),
    resolved_by = COALESCE(resolved_by, $4)
WHERE id = $1 AND branch = $2`;

export const SET_SCREENSHOT_URL = `UPDATE pinpoint_pins
SET screenshot_url = $2
WHERE id = $1 AND screenshot_url IS NULL`;
