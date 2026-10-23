import type { Pin, PinAnchor, PinContext, Priority, Reply } from "../types";

export interface PinRow {
  id: string;
  branch: string;
  path: string;
  deployment_url: string;
  deep_link: string;
  anchor: PinAnchor;
  author: string;
  body: string;
  priority: Priority | null;
  screenshot_url: string | null;
  context: PinContext;
  resolved: boolean;
  resolved_at: Date | string | null;
  resolved_by: string | null;
  created_at: Date | string;
  replies: Reply[];
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function rowToPin(row: PinRow): Pin {
  return {
    id: row.id,
    path: row.path,
    branch: row.branch,
    deploymentUrl: row.deployment_url,
    deepLink: row.deep_link,
    anchor: row.anchor,
    author: row.author,
    body: row.body,
    priority: row.priority,
    screenshotUrl: row.screenshot_url,
    context: row.context,
    replies: row.replies.map((reply) => ({ ...reply, createdAt: toIso(reply.createdAt) })),
    resolved: row.resolved,
    resolvedAt: row.resolved_at === null ? null : toIso(row.resolved_at),
    resolvedBy: row.resolved_by,
    createdAt: toIso(row.created_at),
  };
}
