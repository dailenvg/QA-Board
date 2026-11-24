/**
 * A comment's (or reply's) first line with words in it, so whoever deletes it
 * can see which one it is (a body opening on a blank line would quote nothing).
 */
export function firstLine(body: string): string {
  return body.split("\n").find((line) => line.trim() !== "") ?? body;
}
