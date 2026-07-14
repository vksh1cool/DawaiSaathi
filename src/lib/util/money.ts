/** Rupee formatting with Indian digit grouping (e.g. ₹4,800). */
export function formatInr(amount: number | null | undefined, opts?: { decimals?: number }): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const decimals = opts?.decimals ?? 0;
  const fixed = amount.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = groupIndian(intPart);
  return `₹${grouped}${decPart ? "." + decPart : ""}`;
}

/** 1234567 → "12,34,567" (Indian grouping: last 3, then pairs). */
function groupIndian(intStr: string): string {
  const neg = intStr.startsWith("-");
  const digits = neg ? intStr.slice(1) : intStr;
  if (digits.length <= 3) return (neg ? "-" : "") + digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (neg ? "-" : "") + withCommas + "," + last3;
}

export function roundRupees(n: number): number {
  return Math.max(0, Math.round(n));
}
