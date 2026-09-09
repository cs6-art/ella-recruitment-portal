import { notFound } from "next/navigation";
import CandidateApplicationForm from "@/components/CandidateApplicationForm";
import { getRoleRequestById, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { roleCountryProfile } from "@/lib/role-countries";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId: encodedRoleId } = await params;
  const role = await getRoleRequestById(decodeURIComponent(encodedRoleId));
  if (!role || !isPublishedRoleForIntake(role) || !roleCountryProfile(role.roleCountry)) notFound();
  return <main className="container page"><section className="card"><p className="eyebrow">McLink Careers</p><h1>{role.jobTitle}</h1><p>{role.department} ({role.roleCountry})</p><p>{role.jobDescription}</p></section><CandidateApplicationForm roleId={role.roleId} roleCountry={role.roleCountry} /></main>;
}
