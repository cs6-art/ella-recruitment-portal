const CURRENCY_DETAILS: Record<string, { symbol: string; name: string }> = {
  SGD: { symbol: "S$", name: "Singapore dollar" },
  PHP: { symbol: "₱", name: "Philippine peso" },
  MY: { symbol: "RM", name: "Malaysian ringgit" },
  RUPEE: { symbol: "₹", name: "rupee" },
  RUPIAH: { symbol: "Rp", name: "rupiah" },
};

export function salaryCurrencyLabel(currency: string) {
  const code = currency.trim().toUpperCase();
  if (!code) return "Not provided";
  const details = CURRENCY_DETAILS[code];
  return details ? `${code} — ${details.name}` : code;
}

export function formatSalaryExpectation(amount: string, currency: string) {
  const normalizedAmount = amount.trim();
  const code = currency.trim().toUpperCase();
  if (!normalizedAmount) return "Not provided";

  const numericAmount = Number(normalizedAmount.replace(/,/g, "").replace(new RegExp(`^${code}\\s*`, "i"), ""));
  const details = CURRENCY_DETAILS[code];
  if (details && Number.isFinite(numericAmount)) {
    const formattedAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numericAmount);
    return `${details.symbol}${details.symbol === "Rp" ? " " : ""}${formattedAmount}`;
  }

  if (!code || normalizedAmount.toLowerCase().includes(code.toLowerCase())) return normalizedAmount;
  return `${code} ${normalizedAmount}`;
}
