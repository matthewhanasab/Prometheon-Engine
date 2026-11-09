"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { GITHUB_URL } from "@/lib/nav";

// Footer for every app page. The landing page has its own, fuller footer.
const linkStyle: React.CSSProperties = {
  color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, minHeight: 32,
};

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <footer style={{
      marginTop: "3.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border)",
      paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))",
      display: "flex", flexWrap: "wrap", gap: "10px 28px", alignItems: "center", justifyContent: "space-between",
      fontFamily: "'Public Sans', sans-serif", fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6,
    }}>
      <div>
        {/* The year is computed, so it is never a stale number someone typed. */}
        <span suppressHydrationWarning>© {new Date().getFullYear()}</span> Prometheon Engine. Market data for research, not financial advice.
        <span style={{ display: "block" }}>
          Made by Matthew Hanasab with <span className="heartbeat" role="img" aria-label="love">❤️</span>
        </span>
      </div>
      <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
        <Link href="/about" className="footer-link" style={linkStyle}>About</Link>
        <Link href="/accessibility" className="footer-link" style={linkStyle}>Accessibility</Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="footer-link" style={linkStyle}>
          Source on GitHub <Icon name="external" size={13} />
        </a>
      </nav>
    </footer>
  );
}
