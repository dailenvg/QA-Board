"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type SearchQuery = readonly [query: string, setQuery: (query: string) => void];

const SearchQueryContext = createContext<SearchQuery | null>(null);

/**
 * Holds the workspace search's query above the search itself, which moves between the sidebar
 * and the page at the `lg` breakpoint (a remount), so a query in progress survives the move.
 * Only the search reads it: typing re-renders the search, not the shell around it.
 */
export function SearchQueryProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <SearchQueryContext.Provider value={[query, setQuery]}>{children}</SearchQueryContext.Provider>
  );
}

/** The search query and its setter. Needs a `SearchQueryProvider` above. */
export function useSearchQuery(): SearchQuery {
  const value = useContext(SearchQueryContext);
  if (!value) throw new Error("useSearchQuery needs a SearchQueryProvider above it.");
  return value;
}
