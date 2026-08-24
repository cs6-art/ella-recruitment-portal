import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import ApplicantsList from "@/components/ApplicantsList";
import { canViewRole } from "@/lib/access-control";
import { getApplicants } from "@/lib/candidate-applications";
import { getRoleRequestById } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RoleApplicantsPage({ params }: { params: Promise<{ roleId: string }> }) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");

  const roleId = decodeURIComponent((await params).roleId);
  const [applicants, role] = await Promise.all([getApplicants(), getRoleRequestById(roleId)]);
  // Reuse the same role visibility rule as the role detail page, so a
  // department-scoped (HOD-tier) account only reaches applicants for roles
  // in their own department.
  if (!role || !canViewRole(user, role)) redirect("/dashboard");
  const roleApplicants = applicants.filter((applicant) => applicant.roleId.toLowerCase() === roleId.trim().toLowerCase());

  return (
    <AppShell user={user}>
      <div className="role-applicants-context"><Link className="portal-back-link" href={`/roles/${encodeURIComponent(roleId)}`}>← Back to role details</Link><span>{role?.jobTitle || roleId}</span></div>
      <ApplicantsList applicants={roleApplicants} canManageApplicants={user.canReviewRole === true} title={`${role?.jobTitle || roleId} Applicants`} description="Review candidates connected to this role." />
    </AppShell>
  );
}
