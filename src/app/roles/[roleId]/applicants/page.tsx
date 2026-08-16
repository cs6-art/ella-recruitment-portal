import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import ApplicantsList from "@/components/ApplicantsList";
import { getApplicants } from "@/lib/candidate-applications";
import { getRoleRequestById } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RoleApplicantsPage({ params }: { params: Promise<{ roleId: string }> }) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) redirect("/");
  if (user.canReviewRole !== true && user.canApproveRole !== true) redirect("/dashboard");

  const roleId = decodeURIComponent((await params).roleId);
  const [applicants, role] = await Promise.all([getApplicants(), getRoleRequestById(roleId)]);
  const roleApplicants = applicants.filter((applicant) => applicant.roleId.toLowerCase() === roleId.trim().toLowerCase());

  return (
    <AppShell user={user}>
      <div className="role-applicants-context"><Link className="portal-back-link" href={`/roles/${encodeURIComponent(roleId)}`}>← Back to role details</Link><span>{role?.jobTitle || roleId}</span></div>
      <ApplicantsList applicants={roleApplicants} canManageApplicants={user.canReviewRole === true || user.canApproveRole === true} title={`${role?.jobTitle || roleId} Applicants`} description="Review candidates connected to this role." />
    </AppShell>
  );
}
