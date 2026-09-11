import type { RoleRequestDetails, RoleRequestSummary } from "@/lib/google-sheets";
import type { SessionUser } from "@/lib/session";

/**
 * Confidential departments form a one-way wall: their role requests and
 * applicants are visible only to users who belong to the same department.
 * Belonging to a confidential department does not, on its own, narrow a user's
 * view of everyone else's work — a company-wide access role (HR, Management,
 * Admin) still applies to non-confidential departments. Kept here, with no
 * value imports, so this module stays independently unit-testable.
 */
export const RESTRICTED_DEPARTMENTS = ["AI"] as const;

export function isRestrictedDepartment(value: string): boolean {
  return RESTRICTED_DEPARTMENTS.some((department) => department.toLowerCase() === value.trim().toLowerCase());
}

// Three distinct tiers share this module:
// - canReviewRole: HR/Admin. Company-wide pipeline management — recruitment
//   setup, applicant records, interview scheduling — plus HR-stage review.
// - canApproveRole: Management/Admin. Company-wide visibility, but limited to
//   reviewing and approving/rejecting/returning role requests and hiring
//   decisions. Does not edit recruitment setup, applicant records, or
//   bookings (see canEditApplicant, canEditRecruitmentSetup, bookings routes).
// - canReviewDepartmentRole: HOD/Admin. Read-only visibility (plus interview
//   participation) limited to the holder's own department. No edit, delete,
//   or decision rights anywhere in the pipeline.
function sameDepartment(user: Pick<SessionUser, "department">, department: string): boolean {
  const userDepartment = user.department.trim().toLowerCase();
  return Boolean(userDepartment) && userDepartment === department.trim().toLowerCase();
}

// Confidential-department wall, enforced on top of every tier. It is one-way:
// if the *record's* department is confidential, only same-department users
// pass. A confidential-department user is not otherwise restricted here — their
// access tier still governs every non-confidential department's work. See
// RESTRICTED_DEPARTMENTS above.
export function passesDepartmentWall(user: Pick<SessionUser, "department">, department: string): boolean {
  if (isRestrictedDepartment(department)) {
    return sameDepartment(user, department);
  }
  return true;
}

export function canViewRoleList(user: SessionUser): boolean {
  return user.canReviewRole === true || user.canApproveRole === true || user.canCreateRole === true || user.canReviewDepartmentRole === true;
}

export function isCreatorOnly(user: SessionUser): boolean {
  return user.canCreateRole === true && user.canReviewRole !== true && user.canApproveRole !== true && user.canReviewDepartmentRole !== true;
}

export function isDepartmentReviewer(user: Pick<SessionUser, "canReviewRole" | "canApproveRole" | "canReviewDepartmentRole">): boolean {
  return user.canReviewDepartmentRole === true && user.canReviewRole !== true && user.canApproveRole !== true;
}

export function canViewRole(user: SessionUser, role: Pick<RoleRequestDetails, "requesterEmail" | "department">): boolean {
  if (!passesDepartmentWall(user, role.department)) return false;
  if (user.canReviewRole === true || user.canApproveRole === true) return true;
  if (isDepartmentReviewer(user)) return sameDepartment(user, role.department);
  return isCreatorOnly(user) && role.requesterEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
}

export function filterVisibleRoles<T extends Pick<RoleRequestSummary, "requesterEmail" | "department">>(roles: T[], user: SessionUser): T[] {
  roles = roles.filter((role) => passesDepartmentWall(user, role.department));
  if (user.canReviewRole === true || user.canApproveRole === true) return roles;
  if (isDepartmentReviewer(user)) return roles.filter((role) => sameDepartment(user, role.department));
  if (!isCreatorOnly(user)) return [];
  const email = user.email.trim().toLowerCase();
  return roles.filter((role) => role.requesterEmail.trim().toLowerCase() === email);
}

// Company-wide pipeline management (recruitment setup, applicant records,
// bookings/interview scheduling, resume-screening invites). Management is
// deliberately excluded — their tier is decision-only (approve/reject role
// requests and hiring outcomes), not operational editing.
export function canManagePipeline(user: Pick<SessionUser, "canReviewRole">): boolean {
  return user.canReviewRole === true;
}

export function canEditRecruitmentSetup(user: SessionUser): boolean {
  return canManagePipeline(user);
}

// Pipeline management for a specific role: company-wide HR rights AND the
// confidential-department wall for that role's department. Use this on
// role-scoped operational routes (screening invites, bulk uploads, interview
// availability) that load a role by ID after the tier check.
export function canManageRolePipeline(
  user: Pick<SessionUser, "canReviewRole" | "department">,
  role: Pick<RoleRequestDetails, "department">,
): boolean {
  return canManagePipeline(user) && passesDepartmentWall(user, role.department);
}

export function canEditHodAvailability(user: Pick<SessionUser, "email" | "canReviewRole">, role: Pick<RoleRequestDetails, "hodEmail" | "requesterEmail">): boolean {
  if (user.canReviewRole === true) return true;
  const email = user.email.trim().toLowerCase();
  return [role.hodEmail, role.requesterEmail].some((value) => value.trim().toLowerCase() === email);
}

export function canEditRoleRequest(
  user: Pick<SessionUser, "email" | "canReviewRole">,
  role: Pick<RoleRequestDetails, "requesterEmail" | "status">,
): boolean {
  // Role-request content edits remain available after approval, setup,
  // publication, or rejection so HR can correct or remove records from any
  // workflow stage. Visibility and ownership still control who may perform
  // the action. Management (canApproveRole) is intentionally excluded here —
  // their tier decides via status transitions, it does not edit content.
  if (user.canReviewRole === true) return true;
  return role.requesterEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
}

export function canDeleteRoleRequest(
  user: Pick<SessionUser, "email" | "canReviewRole">,
  role: Pick<RoleRequestDetails, "requesterEmail" | "status">,
): boolean {
  return canEditRoleRequest(user, role);
}

// Editing/deleting applicant records is company-wide HR pipeline management.
// Management (decision-only) and HOD (department read-only) do not qualify —
// Management still decides outcomes via /applicants/[id]/decision.
export function canEditApplicant(user: Pick<SessionUser, "canReviewRole">): boolean {
  return canManagePipeline(user);
}

export function canDeleteApplicant(user: Pick<SessionUser, "canReviewRole">): boolean {
  return canEditApplicant(user);
}

// Approving or rejecting an applicant at any pipeline stage (resume, voice,
// final) is a decision, available to both the operational HR tier and the
// decision-making Management tier.
export function canDecideApplicant(user: Pick<SessionUser, "canReviewRole" | "canApproveRole">): boolean {
  return user.canReviewRole === true || user.canApproveRole === true;
}

export function canViewApplicant(user: SessionUser, applicant: { department: string }): boolean {
  if (!passesDepartmentWall(user, applicant.department)) return false;
  if (user.canReviewRole === true || user.canApproveRole === true) return true;
  if (isDepartmentReviewer(user)) return sameDepartment(user, applicant.department);
  return false;
}

export function filterVisibleApplicants<T extends { department: string }>(applicants: T[], user: SessionUser): T[] {
  applicants = applicants.filter((applicant) => passesDepartmentWall(user, applicant.department));
  if (user.canReviewRole === true || user.canApproveRole === true) return applicants;
  if (isDepartmentReviewer(user)) return applicants.filter((applicant) => sameDepartment(user, applicant.department));
  return [];
}

export function canUseRecruitmentSetup(status: string): boolean {
  return ["Approved", "Recruitment Setup", "Job Posted"].includes(status.trim());
}

export function canManageInterviewAvailability(status: string): boolean {
  return ["Approved", "Recruitment Setup", "Job Posted"].includes(status.trim());
}
