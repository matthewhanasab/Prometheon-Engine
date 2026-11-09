"use client";
import { useEffect, useRef, useState } from "react";

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
  // After a click the chosen link stays marked while the page scrolls to it;
  // otherwise the mark would flick through every section passed on the way.
  const heldUntil = useRef(0);

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
      if (first && performance.now() > heldUntil.current) setActive(first);
    }, { rootMargin: "-120px 0px -55% 0px" });
    els.forEach((el) => obs.observe(el));
    return () => { cancelAnimationFrame(raf); obs.disconnect(); };
  }, [items, watch]);

  // The jump is done here rather than left to the browser. Left alone, each
  // click was a navigation to a new address (#dividends), and the code that
  // restores the scroll position on Back and Forward answered it by putting
  // the page back where it had been, so every link after the first appeared
  // to do nothing. Scrolling directly, and replacing the address instead of
  // adding to history, also means Back leaves the page instead of stepping
  // back through every section visited.
  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // Leave new-tab and new-window clicks to the browser.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // scroll-padding-top on the page keeps the heading clear of the fixed bars.
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    setActive(id);
    heldUntil.current = performance.now() + 1000;
    window.history.replaceState(window.history.state, "", `#${id}`);
    // Move keyboard focus with the view, so Tab continues from the section.
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };

  const shown = items.filter((i) => present.includes(i.id));
  if (shown.length < 3) return null;

  return (
    <nav aria-label="On this page" className="subnav app-bar">
      {shown.map((i) => (
        <a key={i.id} href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined} className="subnav-link"
          onClick={(e) => jump(e, i.id)}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
