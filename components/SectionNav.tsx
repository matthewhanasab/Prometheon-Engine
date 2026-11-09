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
  // The bar has no surface of its own while it sits in the page, so it reads as
  // part of the page. It takes the frosted bar surface only once it is pinned
  // under the top bar, where content scrolls beneath it and it needs one.
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);

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
  const visible = shown.length >= 3;

  useEffect(() => {
    const mark = sentinel.current, nav = bar.current;
    if (!visible || !mark || !nav) return;
    // A marker just above the bar: once it has gone up behind the top bar, the
    // bar below it is pinned. The offset is the bar's own sticky position.
    const offset = Math.round(parseFloat(getComputedStyle(nav).top) || 0);
    const obs = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < offset + 2),
      { rootMargin: `-${offset + 1}px 0px 0px 0px`, threshold: 0 },
    );
    obs.observe(mark);
    return () => obs.disconnect();
  }, [visible]);

  if (!visible) return null;

  return (
    <>
    <div ref={sentinel} aria-hidden style={{ height: 1, marginBottom: -1 }} />
    <nav ref={bar} aria-label="On this page" className="subnav" data-stuck={stuck}>
      {shown.map((i) => (
        <a key={i.id} href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined} className="subnav-link"
          onClick={(e) => jump(e, i.id)}>
          {i.label}
        </a>
      ))}
    </nav>
    </>
  );
}
