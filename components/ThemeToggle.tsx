"use client";
import { useSyncExternalStore } from "react";
import Icon from "@/components/Icon";

type Theme = "light" | "dark";

// The theme lives on <html data-theme>, set before first paint by the inline
// script in layout.tsx. Reading it through a store keeps every toggle on the
// page in step and avoids a flash of the wrong knob position on load.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const readServer = (): Theme => "dark";

function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  // Phone browsers colour their own chrome from this tag.
  document.getElementById("theme-color")?.setAttribute("content", next === "dark" ? "#0C1220" : "#D6D8DD");
  try { localStorage.setItem("theme", next); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

export default function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const theme = useSyncExternalStore(subscribe, read, readServer);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: floating ? "fixed" : "relative",
        ...(floating ? { top: "calc(18px + env(safe-area-inset-top, 0px))", right: "calc(18px + env(safe-area-inset-right, 0px))", zIndex: 300 } : {}),
        width: 58, height: 30, padding: 3, flexShrink: 0,
        display: "inline-flex", alignItems: "center",
        background: isDark ? "rgba(var(--accent-rgb), 0.25)" : "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        transition: "background-color var(--dur-base) ease",
      }}
    >
      <Icon name="sun" size={12} style={{ position: "absolute", left: 8, opacity: isDark ? 0.45 : 0 }} />
      <Icon name="moon" size={12} style={{ position: "absolute", right: 8, opacity: isDark ? 0 : 0.6 }} />
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: isDark ? "var(--accent-gold)" : "#FFFFFF",
        color: isDark ? "var(--on-accent)" : "#4A505E",
        boxShadow: "0 1px 3px rgba(0,0,0,0.28)",
        transform: isDark ? "translateX(28px)" : "translateX(0)",
        transition: "transform var(--dur-base) var(--ease-out), background-color var(--dur-base) ease",
      }}>
        <Icon name={isDark ? "moon" : "sun"} size={12} strokeWidth={2} />
      </span>
    </button>
  );
}
