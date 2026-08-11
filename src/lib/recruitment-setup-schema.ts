import { z } from "zod";

const optionalUrl = z.string().trim().max(2000).refine((value) => value === "" || /^https?:\/\//i.test(value), "Enter a valid http(s) URL.");
const optionalNumber = z.preprocess((value) => value === "" || value === null || value === undefined ? undefined : Number(value), z.number().finite().nonnegative().optional());

export const recruitmentSetupSchema = z.object({
  jobDescription: z.string().trim().min(1, "Job Description is required.").max(20000),
  screeningCriteria: z.string().trim().min(1, "Screening Criteria is required.").max(10000),
  requiredInterviewQuestion1: z.string().trim().max(2000).default(""),
  requiredInterviewQuestion2: z.string().trim().max(2000).default(""),
  requiredInterviewQuestion3: z.string().trim().max(2000).default(""),
  requiredInterviewQuestion4: z.string().trim().max(2000).default(""),
  requiredInterviewQuestion5: z.string().trim().max(2000).default(""),
  aiSystemPrompt: z.string().trim().max(20000),
  initialInterviewBookingLink: optionalUrl,
  hodInterviewBookingLink: optionalUrl,
  postingChannels: z.union([z.string(), z.array(z.string())]).transform((value) => (Array.isArray(value) ? value : value.split(/[\n,]/)).map((item) => item.trim()).filter(Boolean).slice(0, 30)),
  licenseOrCertificateRequired: z.string().trim().max(5000).default(""),
  keywordsToLookFor: z.string().trim().max(5000).default(""),
  minimumYearsOfExperience: optionalNumber,
  transferableSkillsAccepted: z.string().trim().max(5000).default(""),
  salaryOrBudgetRange: z.string().trim().max(1000).default(""),
  earliestAvailabilityRule: z.string().trim().max(1000).default(""),
  salaryDisclosureStatus: z.string().trim().max(30).default(""),
  experienceRequirementStatus: z.string().trim().max(30).default(""),
  licenseRequirementStatus: z.string().trim().max(30).default(""),
  hodInterviewRequired: z.string().trim().max(30).default(""),
  recruitmentSetupStatus: z.string().trim().max(40).default("Draft"),
  setupAction: z.string().trim().max(60).default("save_draft"),
  comments: z.string().trim().max(5000).optional().default(""),
  actionRequestId: z.string().trim().min(1).max(200).optional(),
});

export type RecruitmentSetupInput = z.infer<typeof recruitmentSetupSchema>;
