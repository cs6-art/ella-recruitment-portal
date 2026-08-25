const maxInterviewQuestions = 5;
const questionCountPattern = /\b(\d+)\s*(out of|of|\/)\s*(\d+)\s+questions?\s+answered\b/gi;

/** Keep provider-reported question counts within the portal's five-question maximum. */
export function normalizeInterviewQuestionCount(value: string) {
  return value.replace(questionCountPattern, (match, answeredValue: string, separator: string, totalValue: string) => {
    const answered = Number.parseInt(answeredValue, 10);
    const total = Number.parseInt(totalValue, 10);
    if (!Number.isFinite(answered) || !Number.isFinite(total)) return match;

    const cappedTotal = Math.min(Math.max(total, 0), maxInterviewQuestions);
    const cappedAnswered = Math.min(Math.max(answered, 0), cappedTotal);
    const normalizedSeparator = separator.toLowerCase() === "out of" ? "out of" : separator === "/" ? "/" : "of";
    return `${cappedAnswered} ${normalizedSeparator} ${cappedTotal} question${cappedTotal === 1 ? "" : "s"} answered`;
  });
}
