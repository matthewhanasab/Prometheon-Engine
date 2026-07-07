<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Prometheon Engine

Professional stock research platform. Next.js 14 App Router, TypeScript, recharts, inline styles (no Tailwind classes in components, no shadcn/ui — do not introduce them).

## Visual direction

**"Warm, earthy financial reading room."** Dark, dense, editorial — like an old library with leather, walnut, and gold leaf. Warm charcoal-brown surfaces, cream text, serif headlines, monospaced figures. Never playful, never neon, never cool-toned, never generic SaaS.

### Palette (CSS variables in `app/globals.css` — always use the variables)

- `--bg-primary: #17120E` — page canvas (deep warm charcoal-brown, not black)
- `--bg-surface: #201914` — cards
- `--bg-elevated: #2B221A` — inputs, chips, nested surfaces
- `--border: #3A2E23` / `--border-active: #57432F`
- `--accent-gold: #C9A84C` — THE brand color. Primary buttons, active states, dividers, revenue bars. Use sparingly so it stays special.
- `--text-primary: #F2EAD9` (warm cream), `--text-secondary: #A08F7A` (taupe), `--text-muted: #6E5F4E`
- `--positive: #7A9B4E` (moss), `--negative: #C25B4E` (clay) — gains/losses only

Chart series palette (muted, earthy, no neon and no cool blues): gold `#C9A84C`, terracotta `#C1683C`, moss `#7A9B4E`, sage `#7FA98F`, ochre `#C97B3D`, taupe `#A08F7A`, clay `#C25B4E` (negative values only). Forecast/estimate bars: same hue at `fillOpacity 0.3` with dashed stroke.

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
