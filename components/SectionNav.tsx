"use client";
import { useEffect, useState } from "react";

// A row of jump links that stays under the top bar on a long page, with the
// section in view marked. The research page runs to twenty sections; without
// this the only way to reach "Dividends" is to scroll and hunt.
//
// Sections are found by id, so a link whose section is not on the page (no
// analyst coverage, say) is simply left out.
export default function SectionNav({ items, watch }: {
  items: { id: string; label: string }[];
  /** Changes when the page's content does, so the link set is re-read. */
  watch?: unknown;
}) {
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const ids = items.map((i) => i.id).filter((id) => document.getElementById(id));
    // Read after paint so the sections rendered by this same update are counted.
    const raf = requestAnimationFrame(() => setPresent(ids));
    const els = ids.map((id) => document.getElementById(id)!).filter(Boolean);
    if (!els.length) return () => cancelAnimationFrame(raf);
    // A section is "current" once its heading passes the upper third.
    const seen = new Map<string, boolean>();
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = ids.find((id) => seen.get(id));
      if (first) setActive(first);
    }, { rootMargin: "-120px 0px -55% 0px" });
    els.forEach((el) => obs.observe(el));
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [items, watch]);

  const shown = items.filter((i) => present.includes(i.id));
  if (shown.length < 3) return null;

  return (
    <nav aria-label="On this page" className="subnav app-bar">
      {shown.map((i) => (
        <a key={i.id} href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined} className="subnav-link">
          {i.label}
        </a>
      ))}
    </nav>
  );
}
