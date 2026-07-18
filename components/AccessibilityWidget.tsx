"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Prefs = {
  text: 0 | 1 | 2;     // bigger text (two levels)
  contrast: boolean;   // high contrast
  links: boolean;      // highlight links
  spacing: boolean;    // text spacing
  lineheight: boolean; // taller line height
  motion: boolean;     // pause animations
  images: boolean;     // hide images
  dyslexia: boolean;   // dyslexia-friendly font
  cursor: boolean;     // big cursor
  saturation: boolean; // desaturate colors
};

const DEFAULTS: Prefs = {
  text: 0, contrast: false, links: false, spacing: false, lineheight: false,
  motion: false, images: false, dyslexia: false, cursor: false, saturation: false,
};
const KEY = "a11y_prefs_v2";

function apply(p: Prefs) {
  const el = document.documentElement;
  const set = (attr: string, on: boolean, val = "on") => {
    if (on) el.setAttribute(attr, val); else el.removeAttribute(attr);
  };
  set("data-a11y-text", p.text > 0, p.text === 2 ? "xl" : "lg");
  set("data-a11y-contrast", p.contrast, "high");
  set("data-a11y-links", p.links, "underline");
  set("data-a11y-spacing", p.spacing, "wide");
  set("data-a11y-lineheight", p.lineheight, "tall");
  set("data-a11y-motion", p.motion, "reduce");
  set("data-a11y-images", p.images, "hide");
  set("data-a11y-dyslexia", p.dyslexia);
  set("data-a11y-cursor", p.cursor, "big");
  set("data-a11y-saturation", p.saturation, "low");
}

// ── Icons (17px line icons, currentColor) ────────────────────────────────────
const I = {
  contrast: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 010 18z" fill="currentColor" stroke="none" /></svg>,
  links: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 12h6" /><path d="M10 7H7a5 5 0 000 10h3" /><path d="M14 7h3a5 5 0 010 10h-3" /></svg>,
  text: <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.02em" }}>T<span style={{ fontSize: "0.7rem" }}>T</span></span>,
  spacing: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12h16" strokeDasharray="2 3" /><path d="M7 8l-4 4 4 4" /><path d="M17 8l4 4-4 4" /></svg>,
  motion: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 8v8M14 8v8" /><circle cx="12" cy="12" r="9" strokeDasharray="3 3" strokeWidth="1.4" /></svg>,
  images: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /><path d="M4 3l17 18" /></svg>,
  dyslexia: <span style={{ fontFamily: "Verdana, sans-serif", fontWeight: 700, fontSize: "0.85rem" }}>Df</span>,
  cursor: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M5 3l14 10-6 .8 3.2 5.8-2.6 1.4-3.2-5.9-4.4 4z" /></svg>,
  lineheight: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4v16M12 4l-3 3M12 4l3 3M12 20l-3-3M12 20l3-3" transform="translate(-6 0)" /><path d="M14 6h7M14 12h7M14 18h7" /></svg>,
  saturation: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z" /><path d="M12 3s6 7 6 11a6 6 0 01-6 6z" fill="currentColor" stroke="none" opacity="0.5" /></svg>,
};

function Card({ icon, label, active, level, levels, onClick }: {
  icon: React.ReactNode; label: string; active: boolean;
  level?: number; levels?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7,
        padding: "14px 8px 11px", borderRadius: 14, cursor: "pointer", minHeight: 78,
        background: active ? "rgba(var(--accent-rgb), 0.12)" : "var(--bg-elevated)",
        border: active ? "1.5px solid var(--accent-gold)" : "1px solid var(--border)",
        color: active ? "var(--accent-gold)" : "var(--text-primary)",
      }}
    >
      <span aria-hidden style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 20 }}>{icon}</span>
      <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.64rem", fontWeight: 600, lineHeight: 1.25, textAlign: "center", color: active ? "var(--accent-gold)" : "var(--text-primary)" }}>
        {label}
      </span>
      {levels != null && (
        <span aria-hidden style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: levels }).map((_, i) => (
            <span key={i} style={{
              width: 5, height: 5, borderRadius: "50%",
              background: (level ?? 0) > i ? "var(--accent-gold)" : "var(--border)",
            }} />
          ))}
        </span>
      )}
    </button>
  );
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved) { const p = { ...DEFAULTS, ...saved }; setPrefs(p); apply(p); }
    } catch { /* ignore */ }
  }, []);

  // Esc closes; Ctrl+U toggles (the shortcut UserWay users expect)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function save(next: Prefs) {
    setPrefs(next);
    apply(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
  const flip = (k: Exclude<keyof Prefs, "text">) => save({ ...prefs, [k]: !prefs[k] });
  const cycleText = () => save({ ...prefs, text: ((prefs.text + 1) % 3) as 0 | 1 | 2 });
  const reset = () => save({ ...DEFAULTS });

  const anyActive = prefs.text > 0 || Object.entries(prefs).some(([k, v]) => k !== "text" && v === true);

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 380 }} aria-hidden />
      )}
      <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 400 }}>
        {open && (
          <div role="dialog" aria-label="Accessibility menu" style={{
            position: "absolute", right: 0, bottom: 48, width: 302,
            maxHeight: "min(72vh, 580px)", display: "flex", flexDirection: "column",
            background: "var(--bg-primary)", border: "1px solid var(--border)",
            borderRadius: 18, overflow: "hidden",
            boxShadow: "0 16px 40px rgba(0,0,0,0.32)",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              background: "var(--accent-gold)", padding: "12px 14px",
            }}>
              <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", fontWeight: 700, color: "var(--on-accent)" }}>
                Accessibility Menu <span style={{ fontWeight: 500, opacity: 0.8 }}>(Ctrl+U)</span>
              </span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close accessibility menu" style={{
                width: 26, height: 26, borderRadius: 999, border: "1.5px solid var(--on-accent)",
                background: "transparent", color: "var(--on-accent)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: 13, lineHeight: 1,
              }}>✕</button>
            </div>

            {/* Option grid */}
            <div style={{ overflowY: "auto", padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Card icon={I.contrast}   label="Contrast +"       active={prefs.contrast}   onClick={() => flip("contrast")} />
                <Card icon={I.links}      label="Highlight Links"  active={prefs.links}      onClick={() => flip("links")} />
                <Card icon={I.text}       label="Bigger Text"      active={prefs.text > 0} level={prefs.text} levels={2} onClick={cycleText} />
                <Card icon={I.spacing}    label="Text Spacing"     active={prefs.spacing}    onClick={() => flip("spacing")} />
                <Card icon={I.motion}     label="Pause Animations" active={prefs.motion}     onClick={() => flip("motion")} />
                <Card icon={I.images}     label="Hide Images"      active={prefs.images}     onClick={() => flip("images")} />
                <Card icon={I.dyslexia}   label="Dyslexia Friendly" active={prefs.dyslexia}  onClick={() => flip("dyslexia")} />
                <Card icon={I.cursor}     label="Big Cursor"       active={prefs.cursor}     onClick={() => flip("cursor")} />
                <Card icon={I.lineheight} label="Line Height"      active={prefs.lineheight} onClick={() => flip("lineheight")} />
                <Card icon={I.saturation} label="Saturation"       active={prefs.saturation} onClick={() => flip("saturation")} />
              </div>

              {/* Reset */}
              <button type="button" onClick={reset} disabled={!anyActive} style={{
                width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 999,
                border: "none", cursor: anyActive ? "pointer" : "default",
                background: anyActive ? "var(--accent-gold)" : "var(--bg-elevated)",
                color: anyActive ? "var(--on-accent)" : "var(--text-muted)",
                fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", fontWeight: 700,
              }}>
                Reset All Accessibility Settings
              </button>

              <Link href="/accessibility" onClick={() => setOpen(false)} style={{
                display: "block", textAlign: "center", marginTop: 8, padding: "4px 0",
                fontFamily: "'Public Sans', sans-serif", fontSize: "0.66rem",
                color: "var(--text-secondary)", textDecoration: "none",
              }}>
                Accessibility statement →
              </Link>
            </div>
          </div>
        )}

        {/* Launcher button */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label="Open accessibility menu (Ctrl+U)"
          title="Accessibility menu (Ctrl+U)"
          style={{
            width: 38, height: 38, borderRadius: 999, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: open ? "var(--accent-gold)" : "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: open ? "var(--on-accent)" : "var(--accent-gold)", padding: 0,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="4.5" r="2.2" />
            <path d="M12 8.2c-2.6 0-5.1-.4-7.3-1.2l-.6 1.9c1.9.7 3.9 1.1 6 1.2v3.2l-2.1 7.3 1.9.6 1.9-6.5h.4l1.9 6.5 1.9-.6-2.1-7.3v-3.2c2.1-.1 4.1-.5 6-1.2l-.6-1.9c-2.2.8-4.7 1.2-7.3 1.2z" />
          </svg>
        </button>
      </div>
    </>
  );
}
