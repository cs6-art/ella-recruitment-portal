import { z } from "zod";

const optionalMoney = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return typeof value === "number" ? value : Number(value);
  },
  z.number().finite().min(1, "Salary must be at least 1.").optional(),
);

export const roleRequestSchema = z.object({
  requestType: z.enum(["Staff Addition", "Staff Replacement"]),
  department: z.string().trim().min(2, "Enter the department name, for example Inside Sales.").max(100),
  jobTitle: z.string().trim().min(2, "Enter the job title, for example Inside Sales Specialist.").max(150),
  numberOfVacancies: z.coerce.number().int().min(1).max(100),
  reasonForRequest: z.string().trim().min(10, "Explain why this role is needed.").max(2000),
  jobDescription: z.string().trim().min(20, "Describe the role in at least 20 characters.").max(20000),
  replacementEmployee: z.string().trim().max(150).default(""),
  targetHiringDate: z.string().trim().min(1, "Select a target hiring date."),
  hodAvailabilityDates: z.string().trim().max(5000).default(""),
  hodAvailabilityTimes: z.string().trim().max(5000).default(""),
  customScreeningQuestion1: z.string().trim().max(1000).default(""),
  customScreeningQuestion2: z.string().trim().max(1000).default(""),
  aiGeneratedScreeningQuestions: z.array(z.string().trim().min(1).max(1000)).max(5).default([]),
  reportingManager: z.string().trim().min(2, "Enter the reporting manager's name.").max(150),
  workLocation: z.string().trim().min(2, "Enter the work location, for example Singapore or Hybrid.").max(150),
  employmentType: z.enum(["Full-Time", "Part-Time", "Contract", "Temporary", "Internship"]),
  jobResponsibilities: z.string().trim().min(20, "Describe the main responsibilities in at least one sentence.").max(5000),
  requiredSkills: z.string().trim().min(5, "List the key skills required for this role.").max(3000),
  experienceRequired: z.string().trim().min(2, "Describe the required experience, for example 2+ years in sales.").max(500),
  educationRequirements: z.string().trim().max(1000).default(""),
  preferredQualifications: z.string().trim().max(2000).default(""),
  roleExpectations: z.string().trim().min(10, "Describe the expected outcomes and responsibilities.").max(3000),
  salaryMin: optionalMoney,
  salaryMax: optionalMoney,
  workSchedule: z.string().trim().max(500).default(""),
  noticePeriodRequirement: z.string().trim().max(1000).default(""),
  salaryExpectationGuidance: z.string().trim().max(1000).default(""),
  requesterName: z.string().trim().min(2).max(150),
  requesterEmail: z.string().trim().toLowerCase().email().refine(
    (value) => value.endsWith("@mclinkgroup.com"),
    "Requester email must use the McLink email domain.",
  ),
}).superRefine((value, context) => {
  if (value.requestType === "Staff Replacement" && !value.replacementEmployee) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacementEmployee"],
      message: "Replacement employee is required for staff replacement requests.",
    });
  }

  if (value.salaryMin !== undefined && value.salaryMax !== undefined && value.salaryMin > value.salaryMax) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["salaryMax"],
      message: "Salary minimum cannot be greater than salary maximum.",
    });
  }
});

export type RoleRequestInput = z.infer<typeof roleRequestSchema>;
