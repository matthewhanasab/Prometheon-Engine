// One icon family for the whole site: 24-unit grid, round caps and joins, a
// single stroke weight. Replaces the arrows, crosses, ticks and stars that
// were typed as text characters, which render differently on every platform.
const PATHS = {
  "chevron-left":  <path d="M15 6l-6 6 6 6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-down":  <path d="M6 9l6 6 6-6" />,
  "chevron-up":    <path d="M6 15l6-6 6 6" />,
  "arrow-right":   <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-left":    <path d="M19 12H5M11 6l-6 6 6 6" />,
  "arrow-up":      <path d="M12 19V5M6 11l6-6 6 6" />,
  "arrow-down":    <path d="M12 5v14M6 13l6 6 6-6" />,
  "external":      <path d="M8 7h9v9M17 7L7 17" />,
  "x":             <path d="M6 6l12 12M18 6L6 18" />,
  "check":         <path d="M5 12.5l4.5 4.5L19 7.5" />,
  "search":        <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  "menu":          <path d="M4 7h16M4 12h16M4 17h16" />,
  "sun":           <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  "moon":          <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
  "star":          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />,
  "return":        <path d="M19 5v7a3 3 0 01-3 3H6M10 11l-4 4 4 4" />,
  "alert":         <><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  "refresh":       <path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5" />,
  // Direction markers for price moves; drawn solid (pass `filled`).
  "tri-up":        <path d="M12 6.5l7 11H5z" />,
  "tri-down":      <path d="M12 17.5l7-11H5z" />,
  "camera":        <><path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4z" /><circle cx="12" cy="13.2" r="3.2" /></>,
  "info":          <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8v.3" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name, size = 16, strokeWidth = 1.75, filled = false, style, title,
}: {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
  /** Solid shape instead of an outline (the star, when it marks a winner). */
  filled?: boolean;
  style?: React.CSSProperties;
  /** Give a title only when the icon stands alone; beside a label it is decoration. */
  title?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "-0.14em", flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}
