import { describe, expect, it } from "vitest";
import { foldQuery, matchName, searchWorkspace } from "./search";
import type { Folder, Project } from "./types";

const folder = (id: string, name: string, parentId: string | null): Folder => ({
  id,
  name,
  parentId,
  createdAt: 1,
});

const project = (id: string, name: string, folderId: string): Project => ({
  id,
  name,
  folderId,
  source: { kind: "url", url: "https://example.com/" },
  createdAt: 1,
  updatedAt: 1,
});

/** Client work › Q4 › Launch, and Café menus beside it. */
const FOLDERS: Folder[] = [
  folder("client", "Client work", null),
  folder("q4", "Q4", "client"),
  folder("launch", "Launch", "q4"),
  folder("cafe", "Café menus", null),
];

const PROJECTS: Project[] = [
  project("banner", "Spring Campaign Banner", "launch"),
  project("deck", "Campaign deck", "q4"),
  project("resume", "Résumé review", "cafe"),
  project("home", "Homepage", "client"),
];

const DATA = { folders: FOLDERS, projects: PROJECTS };

const names = (hits: ReadonlyArray<{ project: Project }>) => hits.map((hit) => hit.project.name);

describe("searchWorkspace", () => {
  it("finds nothing for an empty or blank query", () => {
    expect(searchWorkspace(DATA, "")).toEqual({
      folders: [],
      projects: [],
      moreFolders: 0,
      moreProjects: 0,
    });
    expect(searchWorkspace(DATA, "   ").projects).toEqual([]);
  });

  it("ignores case and accents, both ways round", () => {
    expect(names(searchWorkspace(DATA, "CAMPAIGN").projects)).toEqual([
      "Campaign deck",
      "Spring Campaign Banner",
    ]);
    expect(names(searchWorkspace(DATA, "resume").projects)).toEqual(["Résumé review"]);
    expect(names(searchWorkspace(DATA, "RÉSU").projects)).toEqual(["Résumé review"]);
    expect(searchWorkspace(DATA, "cafe").folders.map((hit) => hit.folder.name)).toEqual([
      "Café menus",
    ]);
  });

  it("matches anywhere in a name, at any depth, with the folder path", () => {
    const [hit] = searchWorkspace(DATA, "aign ban").projects;
    expect(hit?.project.id).toBe("banner");
    expect(hit?.path).toEqual(["Client work", "Q4", "Launch"]);
    expect(hit?.match).toEqual({ start: 11, end: 19 });
  });

  it("gives each folder the path above it", () => {
    const { folders } = searchWorkspace(DATA, "launch");
    expect(folders.map((hit) => [hit.folder.name, hit.path])).toEqual([
      ["Launch", ["Client work", "Q4"]],
    ]);
    expect(searchWorkspace(DATA, "client").folders[0]?.path).toEqual([]);
  });

  it("puts names that start with the query first, then A to Z", () => {
    const data = {
      folders: FOLDERS,
      projects: [
        project("a", "Zebra pricing", "client"),
        project("b", "pricing page", "client"),
        project("c", "Old pricing", "client"),
        project("d", "Pricing archive", "client"),
      ],
    };
    expect(names(searchWorkspace(data, "pricing").projects)).toEqual([
      "Pricing archive",
      "pricing page",
      "Old pricing",
      "Zebra pricing",
    ]);
  });

  it("caps each group and counts the rest", () => {
    const many = Array.from({ length: 11 }, (_, index) =>
      project(`p${index}`, `Page ${index + 1}`, "client"),
    );
    const folders = Array.from({ length: 7 }, (_, index) =>
      folder(`f${index}`, `Pages ${index + 1}`, null),
    );
    const results = searchWorkspace({ folders, projects: many }, "page");
    expect(results.projects).toHaveLength(8);
    expect(results.moreProjects).toBe(3);
    expect(results.folders).toHaveLength(5);
    expect(results.moreFolders).toBe(2);
    // Numbers sort as numbers: Page 2 before Page 10.
    expect(names(results.projects).slice(0, 3)).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(
      searchWorkspace({ folders, projects: many }, "page", { folders: 1, projects: 2 }),
    ).toMatchObject({ moreFolders: 6, moreProjects: 9 });
  });
});

describe("matchName", () => {
  it("maps a folded match back onto the accented name", () => {
    expect(matchName("Résumé review", foldQuery("resume"))).toEqual({ start: 0, end: 6 });
    // A decomposed é (e + combining accent) is two characters in the name, one in the match.
    const decomposed = "Café menus";
    expect(matchName(decomposed, foldQuery("café"))).toEqual({ start: 0, end: 5 });
    expect(matchName("Homepage", foldQuery("x"))).toBeNull();
  });
});
