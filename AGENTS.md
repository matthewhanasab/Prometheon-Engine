<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Prometheon Engine

Professional stock research platform. Next.js 14 App Router, TypeScript, recharts, inline styles (no Tailwind classes in components, no shadcn/ui — do not introduce them).

## Visual direction

**"Bloomberg terminal meets luxury print journal."** Dark, dense, editorial. Think a financial reading room: navy ink, gold leaf, serif headlines, monospaced figures. Never playful, never neon, never generic SaaS.

### Palette (CSS variables in `app/globals.css` — always use the variables)

- `--bg-primary: #0A0F1E` — page canvas (deep navy, not black)
- `--bg-surface: #111827` — cards
- `--bg-elevated: #1C2333` — inputs, chips, nested surfaces
- `--border: #1E2D45` / `--border-active: #2E4A6E`
- `--accent-gold: #C9A84C` — THE brand color. Primary buttons, active states, dividers, revenue bars. Use sparingly so it stays special.
- `--text-primary: #F1F5F9`, `--text-secondary: #64748B`, `--text-muted: #4B5563`
- `--positive: #22C55E`, `--negative: #EF4444` — gains/losses only

Chart series palette (muted, no neon): gold `#C9A84C`, steel blue `#5B8DEF`, green `#22C55E`, teal `#14B8A6`, slate `#64748B`, red `#EF4444` (negative values only). Forecast/estimate bars: same hue at `fillOpacity 0.3` with dashed stroke.

### Typography (three fonts, three jobs)

- **Playfair Display** (serif) — page titles and section headings only. 1.75rem / weight 500 / letterSpacing -0.02em for h1.
- **Inter** (sans) — UI labels, body copy, buttons.
- **IBM Plex Mono** — every number: prices, tickers, table figures, chart ticks. Numbers are never set in Inter.

### Recurring patterns (match these exactly)

- **Page header**: Playfair h1 -> 1px gold gradient divider (`linear-gradient(to right, var(--accent-gold), transparent)`, opacity 0.4, maxWidth 200) -> one-line subtitle 0.78rem `--text-secondary`.
- **Section labels**: 0.58rem uppercase Inter, letterSpacing 0.12-0.16em, `--text-secondary`, bottom border.
- **Primary button**: gold bg, `#0A0F1E` text, uppercase 0.72rem weight 700 letterSpacing 0.1em, padding 10px 22px, radius 4.
- **Metric cards**: `--bg-surface`, 1px border, 2px colored top border for tone (green good / red bad / gold neutral), radius 4.
- **Ticker inputs**: IBM Plex Mono, `--bg-elevated`, placeholder "Ticker", auto-uppercase.
- **Border radius**: 4 for cards/buttons/inputs (6 acceptable for pills; never 10+).
- **Tables**: mono figures right-aligned, uppercase Inter column headers, zebra rows via `--bg-surface`/`--bg-primary`.

### Hard rules

- Never use raw Tailwind default colors (blue-500 etc.), shadcn components, or default recharts colors.
- No gradients except the signature gold divider. No glows, no shadows except the mobile sidebar slide-over.
- Data attribution ("Powered by X") stays off the UI.
- All rem-based sizing — root font-size is responsive (`clamp`), so px hardcoding breaks scaling.
- Files must be saved UTF-8 (no BOM). Watch for mojibake when scripting edits — it has bitten this repo before.

## Engineering notes

- FMP Stable API (`https://financialmodelingprep.com/stable`) — key in `FMP_KEY`. The legacy v3 API does NOT work with this key. Screener endpoint is `/company-screener` (not `/stock-screener`).
- Finnhub free tier: recommendations + news only. Price targets come from FMP `/price-target-consensus`.
- FRED key in `FRED_KEY`.
- recharts Tooltip `formatter`/`labelFormatter` params must be typed `any` (TS mismatch with recharts types).
- Run `npm run build` before every push — Vercel deploys `main` automatically.
