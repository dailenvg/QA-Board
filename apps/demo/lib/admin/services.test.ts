import { describe, expect, it } from "vitest";
import { SERVICE_IDS, serviceStatuses } from "./services";

/** Every variable the summary reads, set to a value no answer may carry. */
const FULL = {
  DATABASE_URL: "postgres://user:hunter2@db.example/squint",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_secret",
  RESEND_API_KEY: "re_secret",
  EMAIL_FROM: "Squint <hello@squint.example>",
  AUTH_SECRET: "auth-secret-value",
  PROJECT_AUTH_KEY: "project-auth-key-value",
  CRON_SECRET: "cron-secret-value",
  AUTH_URL: "https://squint.example",
  SQUINT_CAPTURE_URL: "https://capture.example",
  GITHUB_TOKEN: "ghp_secret",
  GITHUB_REPO: "owner/repo",
  PINPOINT_REVIEW_TOKEN: "review-token-value",
};

const configured = (env: Record<string, string | undefined>) =>
  Object.fromEntries(serviceStatuses(env).map(({ id, configured: on }) => [id, on]));

describe("serviceStatuses", () => {
  it("says each service is configured, and nothing more about it", () => {
    const statuses = serviceStatuses(FULL);
    expect(statuses.map((status) => status.id)).toEqual(SERVICE_IDS);
    expect(statuses.every((status) => status.configured)).toBe(true);
    for (const status of statuses) {
      expect(Object.keys(status).sort()).toEqual(["configured", "id", "optional"]);
    }
    const said = JSON.stringify(statuses);
    for (const value of Object.values(FULL)) {
      expect(said).not.toContain(value);
      expect(said).not.toContain(value.slice(0, 8));
    }
  });

  it("says not configured when a variable is missing, empty or blank", () => {
    for (const value of [undefined, "", "   "]) {
      expect(
        Object.values(
          configured({ ...Object.fromEntries(Object.keys(FULL).map((key) => [key, value])) }),
        ),
      ).toEqual(SERVICE_IDS.map(() => false));
    }
  });

  it("needs both GitHub variables for pinpoint's GitHub storage, and the auth secret for ClickUp", () => {
    expect(configured({ ...FULL, GITHUB_REPO: "" })).toMatchObject({ pinpointGitHub: false });
    expect(configured({ ...FULL, AUTH_SECRET: "" })).toMatchObject({
      authSecret: false,
      clickUp: false,
    });
    expect(configured({ ...FULL, EMAIL_FROM: "" })).toMatchObject({
      resendKey: true,
      emailFrom: false,
    });
  });

  it("marks only the services Squint works without as optional", () => {
    const optional = serviceStatuses({})
      .filter((status) => status.optional)
      .map((status) => status.id);
    expect(optional).toEqual([
      "projectAuthKey",
      "authUrl",
      "captureService",
      "pinpointGitHub",
      "pinpointReviewToken",
    ]);
  });
});
