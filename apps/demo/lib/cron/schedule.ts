/**
 * When Vercel Cron runs the daily cleanup, as `vercel.json` sets it (a test
 * keeps them the same). Client-safe.
 */
export const CRON_SCHEDULE = "0 4 * * *";
