import { NextResponse } from "next/server";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";
import { publicCorsOptionsResponse, withPublicCors } from "@/lib/public-cors";
import { roleCountryProfile } from "@/lib/role-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return publicCorsOptionsResponse(request);
}

export async function GET(request: Request) {
  try {
    const roles = (await getRoleRequests({ liveOnly: true }))
      .filter((role) => isPublishedRoleForIntake(role) && Boolean(roleCountryProfile(role.roleCountry)))
      .map((role) => ({ roleId: role.roleId, jobTitle: role.jobTitle, department: role.department, country: role.roleCountry, roleCountry: role.roleCountry, jobDescription: role.jobDescription || "", postingChannels: role.postingChannels || "", applicationLink: role.applicationLink || `/apply/${encodeURIComponent(role.roleId)}` }));
    return withPublicCors(request, NextResponse.json({ success: true, roles }, { headers: { "Cache-Control": "no-store" } }));
  } catch (error) {
    console.error("[API Public Roles] GET failed:", error);
    return withPublicCors(request, NextResponse.json({ success: false, error: "Unable to load published roles." }, { status: 500 }));
  }
}
