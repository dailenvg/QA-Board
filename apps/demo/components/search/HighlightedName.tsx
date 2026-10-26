import type { MatchRange } from "@/lib/store/search";

interface HighlightedNameProps {
  name: string;
  match: MatchRange;
}

/** A name with the part that matched the search marked. */
export function HighlightedName({ name, match }: HighlightedNameProps) {
  return (
    <>
      {name.slice(0, match.start)}
      <mark className="rounded-kbd bg-highlight text-on-highlight">
        {name.slice(match.start, match.end)}
      </mark>
      {name.slice(match.end)}
    </>
  );
}
