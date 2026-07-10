// Black-Scholes pricing toolkit.
// All option pricing in this app is model-estimated on 21-day historical
// volatility (FMP has no options-chain data) — label it honestly in the UI.

export function normCdf(x: number): number {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

export function normPdf(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

export function d1(S: number, K: number, T: number, r: number, sigma: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

export function d2(S: number, K: number, T: number, r: number, sigma: number): number {
  return d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
}

export function callPrice(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return Math.max(S - K, 0);
  const D1 = d1(S, K, T, r, sigma);
  const D2 = D1 - sigma * Math.sqrt(T);
  return S * normCdf(D1) - K * Math.exp(-r * T) * normCdf(D2);
}

export function putPrice(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return Math.max(K - S, 0);
  const D1 = d1(S, K, T, r, sigma);
  const D2 = D1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * normCdf(-D2) - S * normCdf(-D1);
}

export function callDelta(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return S > K ? 1 : 0;
  return normCdf(d1(S, K, T, r, sigma));
}

// Negative for long puts: normCdf(d1) - 1
export function putDelta(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return S < K ? -1 : 0;
  return normCdf(d1(S, K, T, r, sigma)) - 1;
}

// Same for calls and puts
export function gamma(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  return normPdf(d1(S, K, T, r, sigma)) / (S * sigma * Math.sqrt(T));
}

// Per 1% vol move
export function vega(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  return S * normPdf(d1(S, K, T, r, sigma)) * Math.sqrt(T) * 0.01;
}

// Per day
export function callTheta(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const D1 = d1(S, K, T, r, sigma);
  const D2 = D1 - sigma * Math.sqrt(T);
  return ((-(S * normPdf(D1) * sigma) / (2 * Math.sqrt(T))) - r * K * Math.exp(-r * T) * normCdf(D2)) / 365;
}

// Per day
export function putTheta(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  const D1 = d1(S, K, T, r, sigma);
  const D2 = D1 - sigma * Math.sqrt(T);
  return ((-(S * normPdf(D1) * sigma) / (2 * Math.sqrt(T))) + r * K * Math.exp(-r * T) * normCdf(-D2)) / 365;
}

// Per 1% rate move
export function callRho(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  return K * T * Math.exp(-r * T) * normCdf(d2(S, K, T, r, sigma)) * 0.01;
}

// Per 1% rate move
export function putRho(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  return -K * T * Math.exp(-r * T) * normCdf(-d2(S, K, T, r, sigma)) * 0.01;
}

export function probITMCall(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return S > K ? 1 : 0;
  return normCdf(d2(S, K, T, r, sigma));
}

export function probITMPut(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return S < K ? 1 : 0;
  return normCdf(-d2(S, K, T, r, sigma));
}

// 1-standard-deviation move by expiry
export function expectedMove(S: number, sigma: number, T: number): number {
  if (T <= 0 || sigma <= 0) return 0;
  return S * sigma * Math.sqrt(T);
}
