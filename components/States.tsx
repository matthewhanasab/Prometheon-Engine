import Icon from "@/components/Icon";

// The three things a panel can be besides "showing data": on its way, empty,
// or failed. One look for each across the site.

const SANS = "'Public Sans', sans-serif";

/** A block of placeholder lines shaped like the content that is loading. */
export function Skeleton({ lines = 3, height = 14, gap = 10, widths, style }: {
  lines?: number;
  height?: number;
  gap?: number;
  /** Per-line widths (CSS values); defaults to a ragged right edge. */
  widths?: string[];
  style?: React.CSSProperties;
}) {
  const w = widths ?? ["100%", "92%", "78%", "96%", "64%", "88%"];
  return (
    <div role="status" aria-label="Loading" style={{ display: "grid", gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height, width: w[i % w.length] }} />
      ))}
    </div>
  );
}

/** Placeholder for a grid of metric cards. */
export function SkeletonCards({ count = 4, minWidth = 170, height = 92 }: { count?: number; minWidth?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height, borderRadius: 22 }} />
      ))}
    </div>
  );
}

/** Placeholder for a table: a header line and `rows` body lines. */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "14px 16px", display: "grid", gap: 12,
    }}>
      <div className="skeleton-bar" style={{ height: 10, width: "36%" }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height: 16, width: `${96 - (i % 4) * 7}%` }} />
      ))}
    </div>
  );
}

/** Something failed. Says what, and offers the way forward. */
export function ErrorNote({ title = "That didn't load", message, onRetry, style }: {
  title?: string;
  message?: React.ReactNode;
  onRetry?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div role="alert" style={{
      display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
      padding: "16px 18px", fontFamily: SANS, ...style,
    }}>
      <Icon name="alert" size={18} style={{ color: "var(--negative)", marginTop: 1 }} />
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
        {message && <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.55 }}>{message}</div>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{
          display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 16px", cursor: "pointer",
          background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)",
          fontFamily: SANS, fontSize: "0.78rem", fontWeight: 600,
        }}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      )}
    </div>
  );
}

/** Nothing to show, and that is a real answer: says why and what to do next. */
export function EmptyNote({ title, children, style }: {
  title: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 22,
      padding: "22px 24px", fontFamily: SANS, ...style,
    }}>
      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
      {children && <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.6, maxWidth: "65ch" }}>{children}</div>}
    </div>
  );
}
