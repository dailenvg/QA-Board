"use client";

import { SegmentedControl } from "../ui/SegmentedControl";

/** Which comments the panel lists on a project with several pages. */
export type PageScope = "all" | "page";

interface PageFilterProps {
  value: PageScope;
  onChange: (value: PageScope) => void;
  /** The page shown, for the "This page" option's tooltip: "Page 2", or a site's "/pricing". */
  current: string;
}

/** "All pages" (each card says its page) or just the page on the stage. */
export function PageFilter({ value, onChange, current }: PageFilterProps) {
  return (
    <div className="px-3">
      <SegmentedControl
        label="Comments from"
        layoutId="comment-page-scope"
        stretch
        value={value}
        onChange={onChange}
        options={[
          { value: "all", label: "All pages", testId: "scope-all" },
          { value: "page", label: "This page", title: current, testId: "scope-page" },
        ]}
      />
    </div>
  );
}
