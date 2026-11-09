"use client";
import { useEffect, useId, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { loadDirectory, searchDirectory, type DirectoryEntry } from "@/lib/tickerDirectory";

// The ticker box used at the top of every company page. It accepts a symbol
// or a company name: typing "apple" offers AAPL, so a visitor who does not
// know tickers by heart is not stuck at the first field.
//
// The text in the box is the visitor's draft; the page's ticker only changes
// on submit. When the page's ticker changes from outside (Back, the search
// menu), the box follows it.

const SANS = "'Public Sans', sans-serif";
const MONO = "'Spline Sans Mono', monospace";

export default function TickerInput({
  value,
  onSubmit,
  loading = false,
  action = "Load",
  placeholder = "Ticker or company",
  label = "Ticker or company name",
  width = "15rem",
  suggest = true,
  navIndex,
  compact = false,
  onDraftChange,
  id,
}: {
  /** The ticker the page is currently showing. */
  value: string | null;
  onSubmit: (ticker: string) => void;
  loading?: boolean;
  /** Button label: names the action ("Analyze", "Load chain"). Empty hides the button. */
  action?: string;
  placeholder?: string;
  /** Accessible name; the box has no visible label. */
  label?: string;
  width?: string;
  /** Off for fields that take fund symbols, which the company list does not hold. */
  suggest?: boolean;
  /** Keeps the arrow-key field navigation some forms already use. */
  navIndex?: number;
  compact?: boolean;
  /** For forms with their own submit button: reports what is typed so far. */
  onDraftChange?: (text: string) => void;
  /** Lets a visible <label htmlFor> name the field. */
  id?: string;
}) {
  const listId = useId();
  const [draft, setDraft] = useState({ for: value, text: value ?? "" });
  // Re-seed the draft when the page's ticker changes underneath it.
  const text = draft.for === value ? draft.text : (value ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dir, setDir] = useState<DirectoryEntry[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const matches = suggest && open && dir ? searchDirectory(dir, text, 6) : [];
  // Nothing to suggest once the box holds exactly the symbol being shown.
  const showList = matches.length > 0 && !(matches.length === 1 && matches[0][0] === text.toUpperCase() && text.toUpperCase() === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const submit = (t: string) => {
    const sym = t.trim().toUpperCase();
    if (!sym) return;
    setOpen(false); setActive(-1);
    setDraft({ for: value, text: sym });
    onDraftChange?.(sym);
    onSubmit(sym);
  };

  const onChange = (v: string) => {
    setDraft({ for: value, text: v });
    onDraftChange?.(v);
    setActive(-1);
    setOpen(true);
    if (suggest && !dir) loadDirectory().then(setDir);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && showList) { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
    else if (e.key === "ArrowUp" && showList) { e.preventDefault(); setActive((a) => (a <= 0 ? matches.length - 1 : a - 1)); }
    else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); setActive(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0) submit(matches[active][0]);
      else {
        // A name with no exact symbol resolves to its best match.
        const typed = text.trim();
        const isSymbol = /^[A-Za-z]{1,5}([.-][A-Za-z])?$/.test(typed);
        const exact = matches.find(([s]) => s === typed.toUpperCase());
        submit(exact || isSymbol || !matches.length ? typed : matches[0][0]);
      }
    }
  };

  const h = compact ? 38 : 42;

  return (
    <div ref={box} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: action ? undefined : width, maxWidth: "100%" }}>
      <div style={{ position: "relative", width: action ? width : "100%", maxWidth: "100%", flex: "0 1 auto" }}>
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => { e.currentTarget.select(); }}
          onKeyDown={onKeyDown}
          id={id}
          placeholder={placeholder}
          aria-label={id ? undefined : label}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
          enterKeyHint="search"
          data-nav={navIndex}
          style={{
            width: "100%", height: h, padding: "0 1.1rem",
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.9rem", outline: "none",
          }}
        />
        {showList && (
          <div id={listId} role="listbox" aria-label="Matching companies" style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 120,
            width: "max(100%, 19rem)", maxWidth: "calc(100vw - 2rem)", padding: 5,
            background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 16,
            boxShadow: "0 18px 40px -12px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.12)",
          }}>
            {matches.map(([sym, name], i) => (
              <div key={sym} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                onPointerDown={(e) => { e.preventDefault(); submit(sym); }}
                onMouseMove={() => { if (i !== active) setActive(i); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, minHeight: 40, padding: "5px 10px", borderRadius: 11, cursor: "pointer",
                  background: i === active ? "var(--bg-elevated)" : "transparent",
                }}>
                <span style={{ fontFamily: MONO, fontSize: "0.78rem", fontWeight: 600, color: "var(--accent-gold)", minWidth: 52 }}>{sym}</span>
                <span style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {action && (
        <button type="button" onClick={() => submit(text)} disabled={loading} aria-busy={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, height: h, padding: "0 1.25rem",
            background: "var(--accent-gold)", border: "none", color: "var(--on-accent)",
            fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.75 : 1,
          }}>
          {loading && <span className="spinner" style={{ width: 13, height: 13, borderColor: "color-mix(in srgb, var(--on-accent) 30%, transparent)", borderTopColor: "var(--on-accent)" }} />}
          {action}
          {!loading && <Icon name="arrow-right" size={14} strokeWidth={2.2} />}
        </button>
      )}
    </div>
  );
}
