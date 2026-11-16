import { describe, expect, it } from "vitest";
import { TEST_AUTH_SECRET } from "@/test/workspace-fixture";
import { personKey } from "../workspace/members/person-key";
import { sameShareKey, SHARE_PERSON_KEY, shareAvatarVersion, sharePersonKey } from "./share-people";

const USER = "6f1c2a7e-0d3b-4c55-9a10-2b7f3e8d9c41";
const OTHER_USER = "0b9e4d21-7c6a-4f38-8e12-5a3c9d7b1e60";
const WORKSPACE = "3d5e7f90-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const AVATAR = `user/${USER}/avatar/a1`;

describe("a team member's key on a review link", () => {
  it("is 22 characters, differs per link and per person, and never holds the user id", () => {
    const here = sharePersonKey("share-1", USER, TEST_AUTH_SECRET);
    expect(here).toMatch(SHARE_PERSON_KEY);
    expect(sharePersonKey("share-2", USER, TEST_AUTH_SECRET)).not.toBe(here);
    expect(sharePersonKey("share-1", OTHER_USER, TEST_AUTH_SECRET)).not.toBe(here);
    expect(here).not.toContain(USER.slice(0, 8));
    // Not the same person's key in the app either, which a guest must never learn.
    expect(here).not.toBe(personKey(WORKSPACE, USER, TEST_AUTH_SECRET));
  });

  it("is the same on every read of one link, and changes with AUTH_SECRET", () => {
    const here = sharePersonKey("share-1", USER, TEST_AUTH_SECRET);
    expect(sharePersonKey("share-1", USER, TEST_AUTH_SECRET)).toBe(here);
    expect(sharePersonKey("share-1", USER, `${TEST_AUTH_SECRET}-rotated`)).not.toBe(here);
  });

  it("is matched in full only", () => {
    const key = sharePersonKey("share-1", USER, TEST_AUTH_SECRET);
    const flipped = `${key.slice(0, 21)}${key.endsWith("A") ? "B" : "A"}`;
    expect(sameShareKey(key, key)).toBe(true);
    expect(sameShareKey(flipped, key)).toBe(false);
    expect(sameShareKey(key.slice(0, 10), key)).toBe(false);
    expect(sameShareKey("../../etc/passwd", key)).toBe(false);
  });
});

describe("a team member's avatar version on a review link", () => {
  it("differs between two links for the same photo, and changes with the photo", () => {
    const one = shareAvatarVersion("share-1", AVATAR, TEST_AUTH_SECRET);
    expect(one).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(shareAvatarVersion("share-2", AVATAR, TEST_AUTH_SECRET)).not.toBe(one);
    expect(shareAvatarVersion("share-1", `user/${USER}/avatar/a2`, TEST_AUTH_SECRET)).not.toBe(one);
    expect(shareAvatarVersion("share-1", AVATAR, TEST_AUTH_SECRET)).toBe(one);
  });
});
