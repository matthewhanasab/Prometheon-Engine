"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Prefs = {
  text: boolean;      // larger text
  contrast: boolean;  // high contrast
  links: boolean;     // underline links
  motion: boolean;    // reduce motion
};

const DEFAULTS: Prefs = { text: false, contrast: false, links: false, motion: false };
const KEY = "a11y_prefs";

function apply(p: Prefs) {
  const el = document.documentElement;
  if (p.text)     el.dataset.a11yText = "lg";       else delete el.dataset.a11yText;
  if (p.contrast) el.dataset.a11yContrast = "high"; else delete el.dataset.a11yContrast;
  if (p.links)    el.dataset.a11yLinks = "underline"; else delete el.dataset.a11yLinks;
  if (p.motion)   el.dataset.a11yMotion = "reduce";   else delete el.dataset.a11yMotion;
}

function Row({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        width: "100%", background: "transparent", border: "none", cursor: "pointer",
        padding: "8px 4px", textAlign: "left",
      }}
    >
      <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.76rem", color: "var(--text-primary)" }}>{label}</span>
      <span aria-hidden style={{
        width: 34, height: 18, borderRadius: 999, flexShrink: 0, position: "relative",
        background: on ? "var(--accent-gold)" : "var(--bg-elevated)",
        border: "1px solid var(--border)", transition: "background 0.15s ease",
      }}>
        <span style={{
          position: "absolute", top: 1.5, left: on ? 17 : 2, width: 13, height: 13,
          borderRadius: "50%", background: on ? "var(--on-accent)" : "var(--text-secondary)",
          transition: "left 0.15s ease",
        }} />
      </span>
    </button>
  );
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved) { const p = { ...DEFAULTS, ...saved }; setPrefs(p); apply(p); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle(k: keyof Prefs) {
    setPrefs(prev => {
      const next = { ...prev, [k]: !prev[k] };
      apply(next);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 380 }} aria-hidden />
      )}
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 400 }}>
        {open && (
          <div ref={panelRef} role="dialog" aria-label="Accessibility options" style={{
            position: "absolute", right: 0, bottom: 46, width: 228,
            background: "var(--bg-primary)", border: "1px solid var(--border)",
            borderRadius: 18, padding: "12px 14px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          }}>
            <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", padding: "0 4px 6px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
              Accessibility
            </div>
            <Row label="Larger text"     on={prefs.text}     onToggle={() => toggle("text")} />
            <Row label="High contrast"   on={prefs.contrast} onToggle={() => toggle("contrast")} />
            <Row label="Underline links" on={prefs.links}    onToggle={() => toggle("links")} />
            <Row label="Reduce motion"   on={prefs.motion}   onToggle={() => toggle("motion")} />
            <Link href="/accessibility" onClick={() => setOpen(false)} style={{
              display: "block", marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--border)",
              fontFamily: "'Public Sans', sans-serif", fontSize: "0.68rem", color: "var(--accent-gold)",
              textDecoration: "none", padding: "8px 4px 2px",
            }}>
              Accessibility statement →
            </Link>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label="Accessibility options"
          title="Accessibility options"
          style={{
            width: 38, height: 38, borderRadius: 999, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            color: "var(--accent-gold)", padding: 0,
          }}
        >
          {/* Universal access icon */}
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="4.5" r="2.2" />
            <path d="M12 8.2c-2.6 0-5.1-.4-7.3-1.2l-.6 1.9c1.9.7 3.9 1.1 6 1.2v3.2l-2.1 7.3 1.9.6 1.9-6.5h.4l1.9 6.5 1.9-.6-2.1-7.3v-3.2c2.1-.1 4.1-.5 6-1.2l-.6-1.9c-2.2.8-4.7 1.2-7.3 1.2z" />
          </svg>
        </button>
      </div>
    </>
  );
}
