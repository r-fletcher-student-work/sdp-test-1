export function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Per-commit rates (η, ρ) keep at most two decimals. */
export function fmtRate(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
