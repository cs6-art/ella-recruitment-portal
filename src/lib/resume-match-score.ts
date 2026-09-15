/**
 * A deterministic CV-to-role score.
 *
 * The AI workflow still provides the narrative summary, strengths, and gaps,
 * but percentages must not be free-form model output. This rubric uses only
 * job-related evidence and gives the same result for the same resume and role.
 */

export type ResumeMatchRole = {
  jobDescription?: string;
  screeningCriteria?: string;
  requiredSkills?: string;
  experienceRequired?: string;
  educationRequirements?: string;
  licenseOrCertificateRequired?: string;
  keywordsToLookFor?: string;
  minimumYearsOfExperience?: string;
};

export type ResumeMatchScore = {
  score: number;
  matchedRequirements: string[];
  missingRequirements: string[];
  experienceScore: number;
  educationScore: number;
};

const GENERIC_REQUIREMENTS = new Set([
  "experience",
  "skills",
  "skill",
  "knowledge",
  "ability",
  "abilities",
  "good communication",
  "communication",
  "teamwork",
  "team player",
  "problem solving",
]);

const PHRASE_ALIASES: Record<string, string[]> = {
  "sap business one": ["sap b1"],
  "sap b1": ["sap business one"],
  "sql store procedures": ["sql stored procedures", "stored procedures"],
  "sql stored procedures": ["sql store procedures", "stored procedures"],
  "stored procedures": ["sql store procedures", "sql stored procedures"],
  "end user training": ["end-user training", "user training"],
  "it": ["information technology"],
  "information technology": ["it"],
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(value: string) {
  return normalize(value).split(" ").filter((word) => word.length > 1);
}

function containsPhrase(textValue: string, phrase: string) {
  return ` ${textValue} `.includes(` ${normalize(phrase)} `);
}

function isNegated(textValue: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  const paddedText = ` ${textValue} `;
  let found = false;
  let allNegated = true;
  let start = paddedText.indexOf(` ${normalizedPhrase} `);
  while (start >= 0) {
    found = true;
    const precedingText = paddedText.slice(Math.max(0, start - 90), start);
    if (!/\b(?:no|not|without|never|lack|lacks|lacking|does not have|doesn t have|no explicit|no direct)\b(?:\s+[a-z0-9]+){0,5}\s*$/i.test(precedingText)) {
      allNegated = false;
    }
    start = paddedText.indexOf(` ${normalizedPhrase} `, start + 1);
  }
  return found && allNegated;
}

function uniqueRequirements(values: string[]) {
  const seen = new Set<string>();
  return values
    .flatMap((value) => value.split(/[\n,;|\u2022]+/))
    .map((value) => text(value).replace(/^[-*\u2022\d.)]+\s*/, ""))
    .filter((value) => value.length > 1)
    .filter((value) => !GENERIC_REQUIREMENTS.has(normalize(value)))
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function matchesRequirement(resume: string, requirement: string) {
  const normalizedResume = normalize(resume);
  const normalizedRequirement = normalize(requirement);
  if (!normalizedRequirement) return false;

  const phrases = [requirement, ...(PHRASE_ALIASES[normalizedRequirement] || [])];
  const directPhraseFound = phrases.some((phrase) => containsPhrase(normalizedResume, phrase));
  if (directPhraseFound) {
    return phrases.some((phrase) => containsPhrase(normalizedResume, phrase) && !isNegated(normalizedResume, phrase));
  }

  const words = significantWords(requirement);
  // Multi-word requirements need all meaningful words. This avoids awarding
  // SAP Business One credit when a CV mentions only unrelated SAP or business
  // software terms.
  const resumeWords = new Set(normalizedResume.split(" "));
  return words.length > 1 && words.every((word) => resumeWords.has(word));
}

function minimumYears(role: ResumeMatchRole) {
  const configured = text(role.minimumYearsOfExperience).match(/\d+(?:\.\d+)?/);
  if (configured) return Number(configured[0]);
  const source = `${text(role.experienceRequired)} ${text(role.screeningCriteria)}`;
  const inferred = source.match(/(?:minimum|at least|over|more than)\s+(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  return inferred ? Number(inferred[1]) : 0;
}

function resumeYears(resume: string) {
  const matches = [...resume.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  if (matches.length > 0) return Math.max(...matches);

  // Many CVs list employment dates instead of saying "N years". Infer a
  // conservative span from explicit year ranges. The calculation uses only
  // years written in the CV, so the score does not change merely because the
  // calendar moved forward.
  const ranges = [...resume.matchAll(/\b((?:19|20)\d{2})\s*[-\u2013]\s*(?:(?:[a-z]{3,9}\.?'?\s+)?((?:19|20)\d{2})|present)\b/gi)]
    .map((match) => ({ start: Number(match[1]), end: Number(match[2] || match[1]) + (match[2] ? 0 : 1) }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end >= range.start);
  if (ranges.length === 0) return 0;
  return Math.max(...ranges.map((range) => range.end - range.start));
}

function scoreExperience(resume: string, role: ResumeMatchRole, hasRoleEvidence: boolean) {
  const required = minimumYears(role);
  if (!required) return 15;
  if (!hasRoleEvidence) return 0;
  const candidate = resumeYears(resume);
  if (!candidate) return 0;
  return Math.round(Math.min(candidate / required, 1) * 15);
}

function scoreEducation(resume: string, role: ResumeMatchRole) {
  const requirement = normalize(role.educationRequirements);
  const normalizedResume = normalize(resume);
  if (!requirement || /not required|not specified|none/i.test(requirement)) return 10;
  if (/doctor|phd/i.test(requirement) && /doctor|phd/i.test(normalizedResume)) return 10;
  if (/master|mba/i.test(requirement) && /master|mba/i.test(normalizedResume)) return 10;
  if (/bachelor|degree|diploma/i.test(requirement) && /bachelor|degree|diploma|university|college/i.test(normalizedResume)) {
    const subject = requirement.match(/\b(?:in|of)\s+(.+?)(?:\s+(?:or|and)\s+(?:a|an)\s+related|$)/)?.[1]?.trim();
    if (!subject || matchesRequirement(normalizedResume, subject)) return 10;
    return 0;
  }
  return 0;
}

export function calculateResumeMatchScore(resumeText: string, role: ResumeMatchRole): ResumeMatchScore | null {
  const resume = text(resumeText);
  if (!resume || !text(role.jobDescription) && !text(role.screeningCriteria) && !text(role.keywordsToLookFor) && !text(role.requiredSkills)) return null;

  const licenseRequirement = text(role.licenseOrCertificateRequired);
  const requirements = uniqueRequirements([
    text(role.keywordsToLookFor),
    text(role.requiredSkills),
    /not required|not specified|none/i.test(licenseRequirement) ? "" : licenseRequirement,
  ]);
  const matchedRequirements = requirements.filter((requirement) => matchesRequirement(resume, requirement));
  const missingRequirements = requirements.filter((requirement) => !matchedRequirements.includes(requirement));
  const coreScore = requirements.length > 0 ? Math.round((matchedRequirements.length / requirements.length) * 75) : 0;
  const experienceScore = scoreExperience(resume, role, matchedRequirements.length > 0);
  const educationScore = scoreEducation(resume, role);

  return {
    score: Math.max(0, Math.min(100, coreScore + experienceScore + educationScore)),
    matchedRequirements,
    missingRequirements,
    experienceScore,
    educationScore,
  };
}
