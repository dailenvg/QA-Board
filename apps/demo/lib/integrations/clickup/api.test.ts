import { describe, expect, it, vi } from "vitest";
import {
  ClickUpError,
  getClickUpUser,
  listClickUpPeople,
  listClickUpTeams,
  type Fetch,
} from "./api";

const API = "https://api.clickup.com/api";
const TOKEN = `pk_1234_${"A".repeat(32)}`;

/** A fake `fetch` answering `body` with `status`, recording what it was asked. */
function answering(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: Fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(Response.json(body, { status }));
  };
  return { fetcher, calls };
}

/** What a rejected call threw. */
async function thrown(promise: Promise<unknown>): Promise<ClickUpError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ClickUpError)) throw new Error("expected a ClickUpError");
  return error;
}

describe("getClickUpUser", () => {
  it("sends the personal token as it is, with no Bearer, and reads whose it is", async () => {
    const { fetcher, calls } = answering({
      user: { id: 81, username: " Ana‮ Ruiz ", email: "a@x.test" },
    });
    expect(await getClickUpUser(API, TOKEN, fetcher)).toEqual({ id: "81", username: "Ana Ruiz" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${API}/v2/user`);
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(TOKEN);
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.init.redirect).toBe("error");
  });

  it("names a user without a username by their id", async () => {
    const { fetcher } = answering({ user: { id: "9", username: null } });
    expect(await getClickUpUser(API, TOKEN, fetcher)).toEqual({
      id: "9",
      username: "ClickUp user 9",
    });
  });

  it("says ClickUp refused the token on a 401 or 403, and nothing else does", async () => {
    const refused = await thrown(
      getClickUpUser(API, TOKEN, answering({ err: "Token invalid" }, 401).fetcher),
    );
    expect(refused.refused).toBe(true);
    expect(refused.status).toBe(401);
    expect(refused.message).toBe("GET /v2/user answered 401");
    const forbidden = await thrown(getClickUpUser(API, TOKEN, answering({}, 403).fetcher));
    expect(forbidden.refused).toBe(true);
    const down = await thrown(getClickUpUser(API, TOKEN, answering({}, 503).fetcher));
    expect(down.refused).toBe(false);
    expect(down.status).toBe(503);
  });

  it("fails without the token in its message when ClickUp can't be reached or answers oddly", async () => {
    const offline: Fetch = () => Promise.reject(new TypeError(`fetch failed for ${TOKEN}`));
    const unreachable = await thrown(getClickUpUser(API, TOKEN, offline));
    expect(unreachable.message).toBe("GET /v2/user unreachable (TypeError)");
    const odd = await thrown(getClickUpUser(API, TOKEN, answering({ nobody: true }).fetcher));
    expect(odd.message).toBe("GET /v2/user answered in an unknown shape");
    for (const error of [unreachable, odd]) expect(error.message).not.toContain(TOKEN);
  });

  it("gives up after its timeout", async () => {
    vi.useFakeTimers();
    try {
      const hanging: Fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(
              init.signal?.reason instanceof Error ? init.signal.reason : new Error("aborted"),
            ),
          );
        });
      const pending = thrown(getClickUpUser(API, TOKEN, hanging));
      await vi.advanceTimersByTimeAsync(10_000);
      expect((await pending).message).toMatch(
        /^GET \/v2\/user unreachable \((TimeoutError|AbortError)\)$/,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("listClickUpTeams", () => {
  it("lists the token's ClickUp workspaces in ClickUp's order, ids as text, names on one line", async () => {
    const { fetcher, calls } = answering({
      teams: [
        { id: 9012, name: "Acme\nDesign", color: "#000", members: [] },
        { id: "77", name: "" },
        { id: "78", name: "x".repeat(250) },
      ],
    });
    const teams = await listClickUpTeams(API, TOKEN, fetcher);
    expect(calls[0]?.url).toBe(`${API}/v2/team`);
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(TOKEN);
    expect(teams.map(({ id }) => id)).toEqual(["9012", "77", "78"]);
    expect(teams[0]?.name).toBe("Acme Design");
    expect(teams[1]?.name).toBe("ClickUp workspace 77");
    expect(teams[2]?.name).toHaveLength(200);
  });

  it("answers an empty list for a token that reaches none", async () => {
    expect(await listClickUpTeams(API, TOKEN, answering({ teams: [] }).fetcher)).toEqual([]);
  });
});

describe("listClickUpPeople", () => {
  const team = (members: unknown[]) => ({ teams: [{ id: "9012", name: "Acme", members }] });

  it("lists the connected workspace's people by name, ids as text, without their pictures", async () => {
    const { fetcher, calls } = answering(
      team([
        {
          user: { id: 7, username: "zoë", email: "zoe@x.test", profilePicture: "https://x/z.png" },
        },
        { user: { id: "8", username: "Ana\u202E Ruiz", email: null } },
        { user: { id: 9, username: null, email: "no-name@x.test" } },
        { user: { id: 10 } },
        { invited_by: {} },
        { user: { id: 7, username: "Zoë again" } },
      ]),
    );
    const people = await listClickUpPeople(API, TOKEN, "9012", fetcher);
    expect(calls[0]?.url).toBe(`${API}/v2/team`);
    expect(people).toEqual([
      { id: "8", username: "Ana Ruiz", email: null },
      { id: "10", username: "ClickUp user 10", email: null },
      { id: "9", username: "no-name@x.test", email: "no-name@x.test" },
      { id: "7", username: "Zoë again", email: null },
    ]);
  });

  it("refuses when the token no longer reaches the connected workspace", async () => {
    const error = await thrown(listClickUpPeople(API, TOKEN, "4040", answering(team([])).fetcher));
    expect(error.refused).toBe(true);
  });
});
