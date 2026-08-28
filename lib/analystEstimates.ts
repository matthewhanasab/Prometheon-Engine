// Analyst consensus EPS.
//
// This is the one genuinely forward-looking earnings input in the stack that
// is not our own projection. lib/forwardEstimates.ts extrapolates the company's
// filed trajectory and must always be presented as a trend model; what comes
// back from here is what the covering analysts actually publish, so the two are
// kept separate and labelled differently in the UI.
//
// Source is Nasdaq's public analyst endpoint: consensus, high and low EPS per
// fiscal year with the number of estimates behind each.
//
// The fiscal-year subtlety that makes this worth a module:
//
//   The feed lists whichever fiscal years still have estimates outstanding, and
//   that is NOT consistently "next year". In August 2026 Apple's first row is
//   FY-ending Sep 2026 — a month from closing — while Microsoft's is Jun 2027,
//   already its next unreported year. Taking row one as "forward" gives Apple a
//   forward P/E off a year that is nearly reported, which is wrong and wrong in
//   a way that looks plausible.
//
//   So forward EPS here is next-twelve-months: the two straddling fiscal years
//   blended by how much of each actually falls in the coming year. For Apple in
//   Aug 2026 that is 1/12 of FY26 and 11/12 of FY27. Microsoft's NTM P/E comes
//   out at ~25 against a published ~26, which is the check that this is right.

export type ConsensusEstimate = {
  /** Next-twelve-months consensus EPS, blended across fiscal years. */
  ntmEps: number | null;
  /** Consensus EPS for the current (first unclosed) fiscal year. */
  currentYearEps: number | null;
  /** Consensus EPS for the following fiscal year. */
  nextYearEps: number | null;
  /** Growth from current to next fiscal year (decimal). */
  nextYearEpsGrowth: number | null;
  /** Fiscal-year labels as published, e.g. "Sep 2026". */
  currentYearLabel: string | null;
  nextYearLabel: string | null;
  /** Fewest estimates behind either year used — a thin count is a weak number. */
  analysts: number | null;
  basis: string;
};

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

// "Sep 2026" → the last instant of that month, which is when the year closes.
function fiscalEnd(label: string): Date | null {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(String(label).trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return new Date(Date.UTC(Number(m[2]), mi + 1, 0, 23, 59, 59));
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export async function fetchConsensusEps(ticker: string): Promise<ConsensusEstimate | null> {
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!t) return null;

  let rows: Record<string, unknown>[];
  try {
    const res = await fetch(`https://api.nasdaq.com/api/analyst/${t}/earnings-forecast`, {
      headers: {
        // The endpoint returns an HTML challenge page without a browser-shaped
        // Accept header, so this is about content negotiation, not disguise.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        Accept: "application/json",
      },
      next: { revalidate: 43200 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const yearly = json?.data?.yearlyForecast?.rows;
    if (!Array.isArray(yearly) || !yearly.length) return null;
    rows = yearly;
  } catch {
    return null;
  }

  const parsed = rows
    .map((r) => ({
      label: String(r.fiscalEnd ?? ""),
      end: fiscalEnd(String(r.fiscalEnd ?? "")),
      eps: num(r.consensusEPSForecast),
      n: num(r.noOfEstimates),
    }))
    .filter((r) => r.end && r.eps != null)
    .sort((a, b) => a.end!.getTime() - b.end!.getTime());

  const now = new Date();
  // The first year that hasn't closed yet is "current"; the one after is "next".
  const iCur = parsed.findIndex((r) => r.end!.getTime() > now.getTime());
  if (iCur < 0) return null;
  const cur = parsed[iCur];
  const next = parsed[iCur + 1] ?? null;

  // Share of the coming twelve months that still falls inside the current
  // fiscal year. Apple in August sits at ~1/12; a year that just began is ~1.
  const monthsLeft = Math.min(12, Math.max(0,
    (cur.end!.getTime() - now.getTime()) / (365.25 / 12 * 86400000)));
  const w = monthsLeft / 12;

  const ntmEps =
    next?.eps != null ? w * cur.eps! + (1 - w) * next.eps
    : cur.eps;

  const growth =
    next?.eps != null && cur.eps != null && cur.eps !== 0
      ? (next.eps - cur.eps) / Math.abs(cur.eps)
      : null;

  const counts = [cur.n, next?.n ?? null].filter((n): n is number => n != null);

  return {
    ntmEps,
    currentYearEps: cur.eps,
    nextYearEps: next?.eps ?? null,
    nextYearEpsGrowth: growth,
    currentYearLabel: cur.label,
    nextYearLabel: next?.label ?? null,
    analysts: counts.length ? Math.min(...counts) : null,
    basis: "Analyst consensus — next twelve months, blended across fiscal years.",
  };
}
