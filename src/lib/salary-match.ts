export type SalaryMatchStatus = "Matched" | "Above range" | "Below range" | "Not comparable" | "Not provided";

type SalaryMatchInput = {
  salaryExpectation: string;
  salaryCurrency: string;
  approvedSalaryOrBudgetRange: string;
};

type ParsedBudget = {
  currency: string;
  minimum: number;
  maximum: number;
};

const CURRENCY_CODES = ["SGD", "PHP", "MYR"] as const;

function numberTokens(value: string) {
  return value.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)?.map((token) => Number(token.replace(/,/g, ""))).filter(Number.isFinite) || [];
}

function amount(value: string) {
  const parsed = numberTokens(value)[0];
  return parsed && parsed > 0 ? parsed : null;
}

export function parseApprovedSalaryRange(value: string): ParsedBudget | null {
  const source = value.trim();
  const currency = CURRENCY_CODES.find((code) => new RegExp(`\\b${code}\\b`, "i").test(source)) || "";
  const values = numberTokens(source);
  if (!currency || values.length === 0) return null;
  return {
    currency,
    minimum: values[0],
    maximum: values[1] ?? values[0],
  };
}

export function evaluateSalaryMatch(input: SalaryMatchInput): { status: SalaryMatchStatus; notes: string } {
  const expectation = amount(input.salaryExpectation);
  if (!expectation) return { status: "Not provided", notes: "" };

  const budget = parseApprovedSalaryRange(input.approvedSalaryOrBudgetRange);
  const currency = input.salaryCurrency.trim().toUpperCase();
  if (!budget || !currency || budget.currency !== currency) {
    return { status: "Not comparable", notes: "The expected salary and approved budget must use the same supported currency and monthly pay period." };
  }

  if (expectation < budget.minimum) {
    return { status: "Below range", notes: "The expected salary is below the approved range." };
  }
  if (expectation > budget.maximum) {
    return { status: "Above range", notes: "The expected salary is above the approved range." };
  }
  return { status: "Matched", notes: "The expected salary falls within the approved range." };
}
