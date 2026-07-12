"use client";
import { useState, useEffect } from "react";

export default function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = (document.documentElement.dataset.theme as "light" | "dark") || "light";
    setTheme(t);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark mode"
      role="switch"
      aria-checked={isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        ...(floating ? { position: "fixed" as const, top: 18, right: 18, zIndex: 300 } : {}),
        width: 58,
        height: 30,
        padding: 3,
        display: "inline-flex",
        alignItems: "center",
        background: isDark ? "rgba(107, 156, 255, 0.25)" : "var(--bg-elevated)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        position: floating ? "fixed" : "relative",
        transition: "background 0.25s ease",
      }}
    >
      {/* track icons */}
      <span style={{ position: "absolute", left: 8, fontSize: 11, opacity: isDark ? 0.35 : 0.9, transition: "opacity 0.25s" }}>☀</span>
      <span style={{ position: "absolute", right: 8, fontSize: 11, opacity: isDark ? 0.9 : 0.35, transition: "opacity 0.25s" }}>☾</span>
      {/* knob */}
      <span style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: isDark ? "#6B9CFF" : "#FFFFFF",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
        transform: isDark ? "translateX(28px)" : "translateX(0px)",
        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.25s ease",
        display: "inline-block",
      }} />
    </button>
  );
}
