import type { RoleRequestDetails, RoleRequestSummary } from "@/lib/google-sheets";
import type { SessionUser } from "@/lib/session";

export function canViewRoleList(user: SessionUser): boolean {
  return user.canReviewRole === true || user.canApproveRole === true || user.canCreateRole === true;
}

export function isCreatorOnly(user: SessionUser): boolean {
  return user.canCreateRole === true && user.canReviewRole !== true && user.canApproveRole !== true;
}

export function canViewRole(user: SessionUser, role: Pick<RoleRequestDetails, "requesterEmail">): boolean {
  if (user.canReviewRole === true || user.canApproveRole === true) return true;
  return isCreatorOnly(user) && role.requesterEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
}

export function filterVisibleRoles<T extends Pick<RoleRequestSummary, "requesterEmail">>(roles: T[], user: SessionUser): T[] {
  if (user.canReviewRole === true || user.canApproveRole === true) return roles;
  if (!isCreatorOnly(user)) return [];
  const email = user.email.trim().toLowerCase();
  return roles.filter((role) => role.requesterEmail.trim().toLowerCase() === email);
}

export function canEditRecruitmentSetup(user: SessionUser): boolean {
  return user.canReviewRole === true;
}

export function canEditHodAvailability(user: Pick<SessionUser, "email" | "canReviewRole">, role: Pick<RoleRequestDetails, "hodEmail" | "requesterEmail">): boolean {
  if (user.canReviewRole === true) return true;
  const email = user.email.trim().toLowerCase();
  return [role.hodEmail, role.requesterEmail].some((value) => value.trim().toLowerCase() === email);
}

export function canEditRoleRequest(
  user: Pick<SessionUser, "email" | "canReviewRole" | "canApproveRole">,
  role: Pick<RoleRequestDetails, "requesterEmail" | "status">,
): boolean {
  // Role-request actions remain available after approval, setup, publication,
  // or rejection so HR can correct or remove records from any workflow stage.
  // Visibility and ownership still control who may perform the action.
  if (user.canReviewRole === true || user.canApproveRole === true) return true;
  return role.requesterEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
}

export function canDeleteRoleRequest(
  user: Pick<SessionUser, "email" | "canReviewRole" | "canApproveRole">,
  role: Pick<RoleRequestDetails, "requesterEmail" | "status">,
): boolean {
  return canEditRoleRequest(user, role);
}

export function canEditApplicant(user: Pick<SessionUser, "canReviewRole" | "canApproveRole">): boolean {
  return user.canReviewRole === true || user.canApproveRole === true;
}

export function canDeleteApplicant(user: Pick<SessionUser, "canReviewRole" | "canApproveRole">): boolean {
  return canEditApplicant(user);
}

export function canUseRecruitmentSetup(status: string): boolean {
  return ["Approved", "Recruitment Setup", "Job Posted"].includes(status.trim());
}

export function canManageInterviewAvailability(status: string): boolean {
  return ["Approved", "Recruitment Setup", "Job Posted"].includes(status.trim());
}
