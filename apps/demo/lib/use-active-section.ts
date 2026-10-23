import { useEffect, useState } from "react";

/** Id of the section currently crossing the upper third of the viewport, or null. */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
        else if (
          entries.some((entry) => entry.target.id === ids[0] && entry.boundingClientRect.top > 0)
        ) {
          setActive(null);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
