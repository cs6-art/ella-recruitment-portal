export const STATUS_ACTION_LABELS: Record<string, string> = {
  send_for_management_approval: "Send for Management Approval",
  return_for_revision_hr: "Return for Revision by HR",
  place_on_hold_hr: "Place on Hold by HR",
  approve_role: "Approve Role",
  reject_role: "Reject Role",
  return_for_revision_management: "Return for Revision by Management",
  place_on_hold_management: "Place on Hold by Management",
  resume_hr_review: "Resume HR Review",
  resume_management_approval: "Resume Management Approval",
  role_request_created: "Role Request Created",
};

export function getStatusActionLabel(action: string): string {
  return STATUS_ACTION_LABELS[action] || action;
}
