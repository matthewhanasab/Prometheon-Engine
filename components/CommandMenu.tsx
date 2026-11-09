"use client";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { NAV_GROUPS, NAV_ITEMS } from "@/lib/nav";
import { loadDirectory, searchDirectory, type DirectoryEntry } from "@/lib/tickerDirectory";

// The search menu (Cmd/Ctrl+K, or "/"). Type a company or a ticker to open
// its research, or a page name to jump there.
//
// Built on a native <dialog>: showModal() traps focus, makes the page behind
// inert and closes on Escape. It opens and closes without animation: this is
// used many times a session, almost always from the keyboard, and any motion
// would only be a wait.

const SANS = "'Public Sans', sans-serif";
const MONO = "'Spline Sans Mono', monospace";
const RECENT_KEY = "recent_tickers_v1";

type Row = {
  id: string;
  section: string;
  label: string;
  sub?: string;
  href: string;
  ticker?: string;      // shown as a mono chip, and remembered as a recent
};

const noSub = () => () => {};
const isMacClient = () => /Mac|iPhone|iPad/.test(navigator.platform);
/** The platform's name for the shortcut modifier. Mac on the server: the swap, if any, is one character. */
export function useModKey(): string {
  return useSyncExternalStore(noSub, isMacClient, () => true) ? "⌘" : "Ctrl";
}

function readRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((t) => typeof t === "string").slice(0, 5) : [];
  } catch { return []; }
}
function pushRecent(t: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([t, ...readRecents().filter((x) => x !== t)].slice(0, 5)));
  } catch { /* private mode */ }
}

const TICKER_PAGES = NAV_ITEMS.filter((i) => i.tickerParam);
const researchHref = (t: string) => `/research?ticker=${encodeURIComponent(t)}`;

export default function CommandMenu() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const mod = useModKey();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  // Downloaded the first time the menu opens, never before.
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null);

  useEffect(() => {
    const open = () => {
      const d = dialog.current;
      if (!d || d.open) return;
      setQuery(""); setActive(0); setRecents(readRecents());
      d.showModal();
      input.current?.focus();
      if (!directory) loadDirectory().then(setDirectory);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close(); else open();
        return;
      }
      // "/" opens search unless the visitor is typing somewhere.
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("prometheon:search", open);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("prometheon:search", open); };
  }, [directory]);

  const rows: Row[] = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return [
        ...recents.map((t): Row => ({ id: `r-${t}`, section: "Recent", label: `Research ${t}`, href: researchHref(t), ticker: t })),
        ...NAV_GROUPS.flatMap((g) => g.items.map((i): Row => ({ id: `p-${i.href}`, section: g.label, label: i.label, sub: i.hint, href: i.href }))),
      ];
    }
    const upper = q.toUpperCase();
    const lower = q.toLowerCase();
    const out: Row[] = [];

    // Companies: symbol prefix first (the list is ordered by size, so "A"
    // leads with Apple, not an obscure A-ticker), then names.
    const companies = searchDirectory(directory ?? [], q);
    const exact = companies.find(([s]) => s === upper);
    for (const [s, n] of companies) out.push({ id: `c-${s}`, section: "Companies", label: n, href: researchHref(s), ticker: s });

    // Anything shaped like a ticker can be opened even if it is not in the
    // list (funds, small caps, new listings).
    const looksLikeTicker = /^[A-Z]{1,5}([.-][A-Z])?$/.test(upper);
    if (looksLikeTicker && !exact) {
      out.push({ id: `raw-${upper}`, section: "Companies", label: `Open research for ${upper}`, href: researchHref(upper), ticker: upper });
    }

    // With one clear company in hand, offer its other pages.
    const target = exact?.[0] ?? (companies.length === 1 ? companies[0][0] : looksLikeTicker && !companies.length ? upper : null);
    if (target) {
      for (const p of TICKER_PAGES) {
        if (p.href === "/research") continue;
        out.push({ id: `t-${p.href}`, section: `${target} in`, label: p.label, sub: p.hint, href: `${p.href}?${p.tickerParam}=${encodeURIComponent(target)}`, ticker: target });
      }
    }

    for (const i of NAV_ITEMS) {
      if (i.label.toLowerCase().includes(lower) || i.hint.toLowerCase().includes(lower)) {
        out.push({ id: `p-${i.href}`, section: "Pages", label: i.label, sub: i.hint, href: i.href });
      }
    }
    return out;
  }, [query, recents, directory]);

  const current = Math.min(active, Math.max(0, rows.length - 1));

  const go = (row: Row | undefined) => {
    if (!row) return;
    if (row.ticker) pushRecent(row.ticker);
    dialog.current?.close();
    router.push(row.href);
  };

  const move = (delta: number) => {
    if (!rows.length) return;
    const next = (current + delta + rows.length) % rows.length;
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); go(rows[current]); }
  };

  return (
    <dialog ref={dialog} className="cmdk" aria-label="Search"
      onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 10px 0 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Icon name="search" size={18} style={{ color: "var(--text-muted)" }} />
        <input
          ref={input}
          className="cmdk-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder="Search a company, ticker or page"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${current}` : undefined}
          aria-autocomplete="list"
          autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
          enterKeyHint="go"
        />
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close search" style={{
          width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer",
        }}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div id={listId} role="listbox" aria-label="Results" className="cmdk-list">
        {rows.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", fontFamily: SANS, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Nothing matches &ldquo;{query.trim()}&rdquo;. Try a ticker such as AAPL, or a page such as Earnings.
          </div>
        )}
        {rows.map((row, i) => {
          const heading = i === 0 || rows[i - 1].section !== row.section ? row.section : null;
          return (
            <div key={row.id}>
              {heading && (
                <div style={{
                  padding: "10px 12px 5px", fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)",
                }}>
                  {heading}
                </div>
              )}
              <div id={`${listId}-${i}`} role="option" aria-selected={i === current} className="cmdk-option"
                onMouseMove={() => { if (i !== current) setActive(i); }}
                onClick={() => go(row)}>
                {row.ticker && (
                  <span style={{
                    fontFamily: MONO, fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-gold)",
                    minWidth: 58, textAlign: "center", padding: "3px 8px", borderRadius: 999,
                    background: "rgba(var(--accent-rgb), 0.10)", border: "1px solid rgba(var(--accent-rgb), 0.28)", flexShrink: 0,
                  }}>
                    {row.ticker}
                  </span>
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.label}
                  </span>
                  {row.sub && (
                    <span style={{ display: "block", fontFamily: SANS, fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.sub}
                    </span>
                  )}
                </span>
                {i === current && <Icon name="return" size={15} style={{ color: "var(--text-muted)" }} />}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 16, padding: "9px 16px", borderTop: "1px solid var(--border)", flexShrink: 0,
        fontFamily: SANS, fontSize: "0.72rem", color: "var(--text-muted)",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><kbd className="kbd">↵</kbd> open</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><kbd className="kbd">esc</kbd> close</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}><kbd className="kbd">{mod}</kbd><kbd className="kbd">K</kbd></span>
      </div>
    </dialog>
  );
}
