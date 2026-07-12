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

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark mode"
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      style={{
        ...(floating
          ? { position: "fixed" as const, top: 18, right: 18, zIndex: 300 }
          : {}),
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        fontSize: 16,
        lineHeight: 1,
        color: "var(--text-primary)",
      }}
    >
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}
