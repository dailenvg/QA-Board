import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { twoWorkspaces } from "@/test/workspace-fixture";
import { SIGN_IN_TABLES } from "../account/account-deletion";
import { updateWorkspaceSettings } from "../account/workspace-settings";
import { auditDetails } from "./audit-details";

describe("auditDetails", () => {
  it("keeps the documented safe details", () => {
    expect(auditDetails({ fields: ["name", "brandColor", "senderName"] })).toEqual({
      fields: ["name", "brandColor", "senderName"],
    });
    expect(auditDetails({ fields: ["reviewWindow", "clientName"], reviewWindow: "7d" })).toEqual({
      fields: ["reviewWindow", "clientName"],
      reviewWindow: "7d",
    });
    expect(auditDetails({ fields: ["archive-expired"] })).toEqual({ fields: ["archive-expired"] });
    expect(auditDetails({ fields: ["membership"], source: "invite" })).toEqual({
      fields: ["membership"],
      viaInvite: true,
    });
    expect(
      auditDetails({ fields: ["permissions"], before: ["trash"], after: ["trash", "people"] }),
    ).toEqual({
      fields: ["permissions"],
      switches: { before: ["trash"], after: ["trash", "people"] },
    });
  });

  it("counts invitation recipients and says whether a ClickUp send was assigned, never their ids", () => {
    const shared = auditDetails({
      fields: ["invites"],
      shareId: "share-123",
      recipients: ["hmac-1", "hmac-2", "hmac-3"],
    });
    expect(shared).toEqual({ fields: ["invites"], recipients: 3 });
    const sent = auditDetails({
      fields: ["clickup"],
      clickUpTeamId: "team-9",
      channelId: "channel-7",
      assigned: 1,
    });
    expect(sent).toEqual({ fields: ["clickup"], assigned: true });
    expect(JSON.stringify([shared, sent])).not.toMatch(/hmac|share-123|team-9|channel-7/);
  });

  it("drops anything else: unknown keys, odd values, anything shaped like a value", () => {
    expect(
      auditDetails({
        fields: [
          "brandColor",
          "ana@acme.test",
          "A Value",
          "Ana",
          "acme.example",
          "#0c54cc",
          "two words",
          `a${"b".repeat(40)}`,
          "-dash-first",
          42,
          null,
        ],
        reviewWindow: "1y",
        source: "seed-accounts",
        before: ["trash", "root"],
        after: ["trash"],
        email: "ana@acme.test",
        token: "secret",
      }),
    ).toEqual({ fields: ["brandColor"] });
    expect(auditDetails(null)).toEqual({ fields: [] });
    expect(auditDetails(["fields"])).toEqual({ fields: [] });
    expect(auditDetails("secret")).toEqual({ fields: [] });
  });
});

/**
 * Every field name the app records survives `auditDetails`. The names are
 * read from the code that writes them: `fields` arrays given to `audit` and
 * its helpers, and the `"fields"` JSON in the SQL scripts.
 */
describe("the field names the app records", () => {
  const LIB = fileURLToPath(new URL("..", import.meta.url));

  /** Spreads of named lists inside a `fields` array, as their names. */
  const NAMED_LISTS: Readonly<Record<string, readonly string[]>> = { SIGN_IN_TABLES };

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      const isSource = /\.(ts|sql)$/.test(name) && !name.endsWith(".test.ts");
      return isSource && !path.startsWith(join(LIB, "admin")) ? [path] : [];
    });
  }

  /** The text of the bracketed list opening at `start`, nested brackets included. */
  function bracketed(text: string, start: number): string {
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
      if (text[index] === "[") depth += 1;
      if (text[index] === "]") depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
    throw new Error("unclosed list");
  }

  function names(list: string, where: string): string[] {
    const quoted = [...list.matchAll(/["']([^"']+)["']/g)].map((match) => match[1] ?? "");
    const spread = [...list.matchAll(/\.\.\.([A-Z_]+)\b/g)].flatMap((match) => {
      const named = NAMED_LISTS[match[1] ?? ""];
      if (!named) throw new Error(`${where}: unknown list ...${match[1]} in fields`);
      return named;
    });
    return [...quoted, ...spread];
  }

  /** Every field name written in `text`, a file of lib/. */
  function recordedIn(text: string, where: string): string[] {
    const found: string[] = [];
    // `fields: [...]` and `const fields = [...]`.
    for (const match of text.matchAll(/\bfields\s*[:=]\s*\[/g)) {
      found.push(...names(bracketed(text, (match.index ?? 0) + match[0].length - 1), where));
    }
    // `auditAccount(tx, id, "action", ["name"], now)` and `auditWorkspace(...)`.
    for (const match of text.matchAll(/\baudit(?:Account|Workspace)\(/g)) {
      const call = text.slice(match.index, text.indexOf(";", match.index));
      const open = call.indexOf("[");
      if (open >= 0) found.push(...names(bracketed(call, open), where));
    }
    // The SQL scripts' `'{"fields":["seat_limit"]}'`.
    for (const match of text.matchAll(/"fields":\s*\[([^\]]*)\]/g)) {
      found.push(...names(match[1] ?? "", where));
    }
    return found;
  }

  const recorded = sources(LIB).flatMap((path) =>
    recordedIn(readFileSync(path, "utf8"), relative(LIB, path)).map((field) => ({
      field,
      where: relative(LIB, path),
    })),
  );

  it("finds them in the code (so the check below isn't empty)", () => {
    const fields = new Set(recorded.map(({ field }) => field));
    for (const field of ["archive-expired", "reviewWindow", "clientName", "seat_limit"]) {
      expect(fields).toContain(field);
    }
    expect(fields.size).toBeGreaterThanOrEqual(20);
  });

  it("keeps every one of them", () => {
    const dropped = recorded.filter(
      ({ field }) => !auditDetails({ fields: [field] }).fields.includes(field),
    );
    expect(dropped).toEqual([]);
  });

  it("keeps the workspace settings' names, which the code works out as it saves", async () => {
    const { db, a } = await twoWorkspaces();
    await updateWorkspaceSettings(
      db,
      { userId: a.userId, workspaceId: a.workspaceId },
      { name: "Acme Studio", brandColor: "#112233", senderName: "Acme Team" },
      Date.now(),
    );
    const { rows } = await db.query<{ meta: unknown }>(
      "SELECT meta FROM audit_log WHERE action = 'workspace.settings_changed'",
    );
    expect(rows.map((row) => auditDetails(row.meta).fields)).toEqual([
      ["name", "brandColor", "senderName"],
    ]);
  });
});
