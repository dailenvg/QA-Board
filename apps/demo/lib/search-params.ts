/** A page's `searchParams`, as Next passes them. */
export type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a query parameter that may repeat. */
export function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
