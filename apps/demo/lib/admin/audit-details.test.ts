import { describe, expect, it } from "vitest";
import { auditDetails } from "./audit-details";

describe("auditDetails", () => {
  it("keeps the documented safe details", () => {
    expect(auditDetails({ fields: ["name", "brand_color"] })).toEqual({
      fields: ["name", "brand_color"],
    });
    expect(auditDetails({ fields: ["review_window"], reviewWindow: "7d" })).toEqual({
      fields: ["review_window"],
      reviewWindow: "7d",
    });
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

  it("drops anything else: unknown keys, odd values, field names that look like values", () => {
    expect(
      auditDetails({
        fields: ["name", "ana@acme.test", "A Value", 42, null],
        reviewWindow: "1y",
        source: "seed-accounts",
        before: ["trash", "root"],
        after: ["trash"],
        email: "ana@acme.test",
        token: "secret",
      }),
    ).toEqual({ fields: ["name"] });
    expect(auditDetails(null)).toEqual({ fields: [] });
    expect(auditDetails(["fields"])).toEqual({ fields: [] });
    expect(auditDetails("secret")).toEqual({ fields: [] });
  });
});
