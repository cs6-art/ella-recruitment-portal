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

export function canUseRecruitmentSetup(status: string): boolean {
  return status === "Approved" || status === "Recruitment Setup";
}

export function canManageInterviewAvailability(status: string): boolean {
  return ["Approved", "Recruitment Setup", "Job Posted"].includes(status.trim());
}
