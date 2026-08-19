/**
 * Recruitment access-role catalog used by account administration. The
 * permissions remain independently editable because a department may need a
 * small variation from the recommended default for that role.
 */
export type AccessRolePermissions = {
  canCreateRole: boolean;
  canReviewRole: boolean;
  canApproveRole: boolean;
  canEditSettings: boolean;
  canManageUsers: boolean;
};

export type AccessRoleOption = AccessRolePermissions & {
  value: string;
  label: string;
  description: string;
};

export const ACCESS_ROLE_OPTIONS: AccessRoleOption[] = [
  {
    value: "Admin",
    label: "Admin",
    description: "Manage users, portal settings, and all recruitment workflows.",
    canCreateRole: true,
    canReviewRole: true,
    canApproveRole: true,
    canEditSettings: true,
    canManageUsers: true,
  },
  {
    value: "HR",
    label: "HR",
    description: "Create and review role requests, candidates, and interviews.",
    canCreateRole: true,
    canReviewRole: true,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Management",
    label: "Management",
    description: "Approve or reject role requests as the management decision-maker.",
    canCreateRole: false,
    canReviewRole: true,
    canApproveRole: true,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "HOD",
    label: "HOD / Department Head",
    description: "Review department hiring needs and participate in interviews.",
    canCreateRole: true,
    canReviewRole: true,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Recruiter",
    label: "Recruiter",
    description: "Manage candidate screening, interviews, and recruitment activity.",
    canCreateRole: true,
    canReviewRole: true,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Interviewer",
    label: "Interviewer",
    description: "Review candidates and conduct assigned interviews.",
    canCreateRole: false,
    canReviewRole: true,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Hiring Manager",
    label: "Hiring Manager",
    description: "Review role requirements and make hiring approvals.",
    canCreateRole: false,
    canReviewRole: true,
    canApproveRole: true,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Finance Reviewer",
    label: "Finance Reviewer",
    description: "Read recruitment information for budget and salary review.",
    canCreateRole: false,
    canReviewRole: false,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Auditor",
    label: "Auditor / Read-only",
    description: "View permitted records without changing recruitment data.",
    canCreateRole: false,
    canReviewRole: false,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
  {
    value: "Requester",
    label: "Requester / Employee",
    description: "Submit and track the requester’s own role requests.",
    canCreateRole: true,
    canReviewRole: false,
    canApproveRole: false,
    canEditSettings: false,
    canManageUsers: false,
  },
];

export function getAccessRolePreset(value: string): AccessRoleOption | undefined {
  const normalized = value.trim().toLowerCase();
  return ACCESS_ROLE_OPTIONS.find((option) => option.value.toLowerCase() === normalized);
}
