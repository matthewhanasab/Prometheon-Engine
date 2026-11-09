<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Prometheon Engine

Professional stock research platform. Next.js 14 App Router, TypeScript, recharts, inline styles (no Tailwind classes in components, no shadcn/ui — do not introduce them).

## Visual direction

**"Bloomberg terminal meets luxury print journal."** Dense, editorial, calm. Navy ink, one blue accent, grotesque headlines, monospaced figures. Never playful, never neon, never generic SaaS.

Dark is the default theme; light is a first-class theme and every change must be checked in both.

### Palette (CSS variables — always use the variables, never a hex)

Light values live in `app/globals.css` (`:root`); dark values in the inline block in `app/layout.tsx` (`:root[data-theme="dark"]`).

- `--bg-primary` — page ground (`#0C1220` dark, `#D6D8DD` light), painted once on a fixed layer
- `--bg-surface` — cards; `--bg-elevated` — inputs, chips, hover
- `--border` / `--border-active`
- `--accent-gold` — the accent. **It is blue** (`#6B9CFF` dark, `#1F4FCC` light); the name is historical. Primary buttons, active states, links.
- `--text-primary`, `--text-secondary`, `--text-muted` — all three hold at least 4.5:1 on the page ground and on a card, in both themes. Do not introduce a lighter grey.
- `--positive` / `--negative` — up and down, and nothing else
- `--series-1` … `--series-6` — chart series, in fixed order. Validated for colour-blind separation and contrast per theme. Green and red are not in the set. Text never wears a series colour; put a coloured dot beside it.

### Typography (three fonts, three jobs)

- **Space Grotesk** — page titles and section headings. h1 is 1.75rem / 500 / -0.02em.
- **Public Sans** — labels, body copy, buttons.
- **Spline Sans Mono** — every number: prices, tickers, table figures, chart ticks.
- **Nothing below `0.6875rem`** (11px on a phone). Chart ticks no smaller than 11.
- Buttons and tabs are sentence case. Uppercase with tracking is for small section labels only.

### Shared components (use these; do not retype them per page)

- `components/PageHeader` — title, accent rule, one-line subtitle; controls go in as children.
- `components/TickerInput` — the ticker box, with company-name suggestions.
- `lib/useUrlTicker` + `lib/useTickerData` — the ticker lives in the address (`?ticker=`); data loads with the previous company kept on screen, dimmed, until the next arrives.
- `components/States` — `Skeleton*`, `ErrorNote` (with retry), `EmptyNote`. Content that is loading is a skeleton, not the word "Loading".
- `components/Icon` — the only icon source. No arrows, crosses, ticks, stars or emoji typed as characters (the heart in the footer is the one exception).
- `components/charts/kit` — everything a chart is built from: `ChartCard` (title, headline figure, change, then the plot), `StatCell` in a `.stat-strip` for a row of headline figures, `ChartTip` / `seriesTip` / `FormattedTip` for the hover readout, `Delta`, `Sparkline`, `LegendRow`, `Segmented`, the number formats, and the axis and grid settings (`xAxis`, `yAxis`, `grid`). A new chart uses these; it does not restyle recharts by hand. Bars are at most 24px wide with a 3px rounded top, lines are 2px, grids are solid hairlines, fills are a flat 10% wash, and a chart never prints a number on every point.
- `components/Sheet` — side panel for detail; `components/SectionNav` — jump links on long pages.
- `components/CommandMenu` — search (Cmd/Ctrl+K). `lib/nav.ts` is the single list of pages for the top bar, drawer, search and footers; add a page there.

### Rules

- Cards are flat: `--bg-surface`, 1px `--border`, radius 22. No drop shadows, no backdrop blur, no coloured side borders. Only the fixed bars are frosted.
- No gradients except the signature accent rule under a page title.
- The page scrolls (not an inner container). Fixed bars pad for `env(safe-area-inset-*)`.
- Hover styles go inside `@media (hover: hover) and (pointer: fine)`. Every button has a press state (global).
- Inputs are 16px on touch and every field has a real label (`htmlFor`/`aria-label`).
- Motion: under 300ms, `var(--ease-out)`, transform and opacity only, and it must respect `prefers-reduced-motion`.
- Data attribution ("Powered by X") stays off the UI.
- All rem-based sizing — the root font-size is responsive on desktop.
- Files must be saved UTF-8 (no BOM). Watch for mojibake when scripting edits — it has bitten this repo before.

## Engineering notes

- FMP Stable API (`https://financialmodelingprep.com/stable`) — key in `FMP_KEY`. The legacy v3 API does NOT work with this key. Screener endpoint is `/company-screener` (not `/stock-screener`).
- Finnhub free tier: recommendations + news only. Price targets come from FMP `/price-target-consensus`.
- FRED key in `FRED_KEY`.
- recharts Tooltip `formatter`/`labelFormatter` params must be typed `any` (TS mismatch with recharts types).
- Run `npm run build` before every push — Vercel deploys `main` automatically.
- Local development without the data keys: start the dev server with `DEV_API_ORIGIN=https://www.prometheonengine.com` (the `prometheon-live-data` launch entry) and `/api/*` is answered by the live site. Restart the dev server after editing `app/globals.css`; it does not always hot-reload.
