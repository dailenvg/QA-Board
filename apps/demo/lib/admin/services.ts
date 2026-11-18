import { clickUpApiUrl } from "../integrations/clickup/config";

/**
 * Which of the services Squint reads from its environment are set up here,
 * for the System page: a yes or no each, never a value, its length, a prefix
 * or a hash. Server code only (the admin pages read it).
 */

export const SERVICE_IDS = [
  "database",
  "blob",
  "resendKey",
  "emailFrom",
  "authSecret",
  "projectAuthKey",
  "cronSecret",
  "authUrl",
  "clickUp",
  "captureService",
  "pinpointGitHub",
  "pinpointReviewToken",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export interface ServiceStatus {
  id: ServiceId;
  configured: boolean;
  /** Squint works without it (something else stands in), so not configured is no fault. */
  optional: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const isSet = (env: Env, name: string) => Boolean(env[name]?.trim());

/** Whether each service is configured, and whether it's optional. */
export function serviceStatuses(env: Env = process.env): ServiceStatus[] {
  const configured: Record<ServiceId, boolean> = {
    database: isSet(env, "DATABASE_URL"),
    blob: isSet(env, "BLOB_READ_WRITE_TOKEN"),
    resendKey: isSet(env, "RESEND_API_KEY"),
    emailFrom: isSet(env, "EMAIL_FROM"),
    authSecret: isSet(env, "AUTH_SECRET"),
    projectAuthKey: isSet(env, "PROJECT_AUTH_KEY"),
    cronSecret: isSet(env, "CRON_SECRET"),
    authUrl: isSet(env, "AUTH_URL"),
    clickUp: clickUpApiUrl(env) !== null,
    captureService: isSet(env, "SQUINT_CAPTURE_URL"),
    pinpointGitHub: isSet(env, "GITHUB_TOKEN") && isSet(env, "GITHUB_REPO"),
    pinpointReviewToken: isSet(env, "PINPOINT_REVIEW_TOKEN"),
  };
  const optional = new Set<ServiceId>([
    "projectAuthKey",
    "authUrl",
    "captureService",
    "pinpointGitHub",
    "pinpointReviewToken",
  ]);
  return SERVICE_IDS.map((id) => ({ id, configured: configured[id], optional: optional.has(id) }));
}
