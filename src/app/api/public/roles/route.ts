import { NextResponse } from "next/server";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { roleCountryProfile } from "@/lib/role-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const roles = (await getRoleRequests({ liveOnly: true }))
      .filter((role) => isPublishedRoleForIntake(role) && Boolean(roleCountryProfile(role.roleCountry)))
      .map((role) => ({ roleId: role.roleId, jobTitle: role.jobTitle, department: role.department, country: role.roleCountry, roleCountry: role.roleCountry, jobDescription: role.jobDescription || "", postingChannels: role.postingChannels || "", applicationLink: role.applicationLink || `/apply/${encodeURIComponent(role.roleId)}` }));
    return NextResponse.json({ success: true, roles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API Public Roles] GET failed:", error);
    return NextResponse.json({ success: false, error: "Unable to load published roles." }, { status: 500 });
  }
}
