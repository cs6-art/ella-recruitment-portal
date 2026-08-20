import { NextResponse } from "next/server";
import { getRoleRequests, isPublishedRoleForIntake } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const roles = (await getRoleRequests({ liveOnly: true }))
      .filter(isPublishedRoleForIntake)
      .map((role) => ({ roleId: role.roleId, jobTitle: role.jobTitle, department: role.department, jobDescription: role.jobDescription || "", postingChannels: role.postingChannels || "", applicationLink: role.applicationLink || `/apply/${encodeURIComponent(role.roleId)}` }));
    return NextResponse.json({ success: true, roles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API Public Roles] GET failed:", error);
    return NextResponse.json({ success: false, error: "Unable to load published roles." }, { status: 500 });
  }
}
