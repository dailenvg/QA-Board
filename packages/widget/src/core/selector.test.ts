import { beforeEach, describe, expect, it } from "vitest";
import { generateSelector, isStableId, resolveSelector } from "./selector";

function mount(html: string): void {
  document.body.innerHTML = html;
}

function byText(text: string): Element {
  const match = Array.from(document.body.querySelectorAll("*")).find(
    (element) => element.children.length === 0 && element.textContent === text,
  );
  if (!match) throw new Error(`No element with text ${text}`);
  return match;
}

function expectUniqueMatch(selector: string, element: Element): void {
  const matches = document.querySelectorAll(selector);
  expect(matches).toHaveLength(1);
  expect(matches[0]).toBe(element);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("isStableId", () => {
  it.each(["hero", "pricing-table", "main_nav", "section2", "step-3", "__next"])(
    "accepts hand-written id %s",
    (id) => expect(isStableId(id)).toBe(true),
  );

  it.each([
    [":r1:", "React useId"],
    ["«r1»", "React 19.1 useId"],
    ["radix-:R2mH1:", "Radix"],
    ["123abc", "leading digit"],
    ["item-1700000000", "long numeric run"],
    ["ember381", "digit-heavy"],
    ["css-1a2b3c", "hash segment"],
    ["mui-x7f9k2", "hash segment"],
    ["", "empty"],
    ["has space", "whitespace"],
  ])("rejects %s (%s)", (id) => expect(isStableId(id)).toBe(false));
});

describe("generateSelector", () => {
  it("prefers a stable, unique id", () => {
    mount(`<main><button id="buy">Buy</button></main>`);
    const button = byText("Buy");
    expect(generateSelector(button)).toBe("#buy");
  });

  it("skips auto-generated ids", () => {
    mount(`<section data-testid="plans"><button id=":r5:">Buy</button></section>`);
    const selector = generateSelector(byText("Buy"));
    expect(selector).not.toContain(":r5:");
    expectUniqueMatch(selector, byText("Buy"));
  });

  it("skips ids that are not unique", () => {
    mount(`<p id="dup">One</p><p id="dup" data-testid="second">Two</p>`);
    expect(generateSelector(byText("Two"))).toBe('[data-testid="second"]');
  });

  it("uses data-testid before other attributes", () => {
    mount(`<button data-testid="cta" aria-label="Start">Go</button>`);
    expect(generateSelector(byText("Go"))).toBe('[data-testid="cta"]');
  });

  it("falls back to other stable attributes when unique", () => {
    mount(`<input name="email" /><button aria-label="Close dialog">x</button>`);
    expect(generateSelector(document.querySelector("input")!)).toBe('input[name="email"]');
    expect(generateSelector(byText("x"))).toBe('button[aria-label="Close dialog"]');
  });

  it("escapes attribute values", () => {
    mount(`<button aria-label='Say "hi"'>Hi</button>`);
    const selector = generateSelector(byText("Hi"));
    expectUniqueMatch(selector, byText("Hi"));
  });

  it("builds an nth-of-type path anchored at the nearest stable ancestor", () => {
    mount(`
      <ul id="features">
        <li><span>A</span></li>
        <li><span>B</span></li>
        <li><span>C</span></li>
      </ul>
      <ul><li><span>D</span></li></ul>
    `);
    const selector = generateSelector(byText("B"));
    expect(selector).toBe("#features > li:nth-of-type(2) > span");
    expectUniqueMatch(selector, byText("B"));
  });

  it("produces a unique selector for every element in a repetitive tree", () => {
    mount(`
      <div><div><p>1</p><p>2</p></div><div><p>3</p><p>4</p></div></div>
      <div><div><p>5</p></div></div>
    `);
    for (const text of ["1", "2", "3", "4", "5"]) {
      const element = byText(text);
      expectUniqueMatch(generateSelector(element), element);
    }
  });

  it("handles body itself", () => {
    expect(generateSelector(document.body)).toBe("body");
  });
});

describe("resolveSelector", () => {
  it("finds the element a selector was generated for", () => {
    mount(`<article><h2>Title</h2><p>Body</p><p>More</p></article>`);
    const element = byText("More");
    expect(resolveSelector(generateSelector(element))).toBe(element);
  });

  it("returns null when the element is gone", () => {
    mount(`<p id="gone">Bye</p>`);
    const selector = generateSelector(byText("Bye"));
    document.body.innerHTML = "";
    expect(resolveSelector(selector)).toBeNull();
  });

  it("returns null for an invalid selector instead of throwing", () => {
    expect(resolveSelector("div[")).toBeNull();
  });
});
