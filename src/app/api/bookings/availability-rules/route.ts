import crypto from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canEditHodAvailability, canEditRecruitmentSetup, canViewRole } from "@/lib/access-control";
import { getRoleRequestById, updateRoleRequestFields } from "@/lib/google-sheets";
import { hasValidFutureTime, parseAvailabilityRules, roleAvailabilityRules, serializeAvailabilityRules, virtualSlotsForRole, type InterviewAvailabilityRule } from "@/lib/interview-availability-rules";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanRule(roleId: string, raw: Partial<InterviewAvailabilityRule>): InterviewAvailabilityRule {
  const interviewType = raw.interviewType === "Final Interview" ? "Final Interview" : "AI Voice Interview";
  return {
    ruleId: String(raw.ruleId || crypto.randomUUID()),
    roleId,
    interviewType,
    mode: raw.mode === "specific" ? "specific" : "recurring",
    startDate: String(raw.startDate || ""),
    endDate: String(raw.endDate || ""),
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [],
    startTime: String(raw.startTime || ""),
    endTime: String(raw.endTime || ""),
    slotDurationMinutes: interviewType === "AI Voice Interview" ? 10 : Number(raw.slotDurationMinutes || 30),
    timezone: String(raw.timezone || "Asia/Singapore").trim(),
    specificSlots: Array.isArray(raw.specificSlots) ? raw.specificSlots as InterviewAvailabilityRule["specificSlots"] : [],
    status: "Active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json() as { roleId?: string; rule?: Partial<InterviewAvailabilityRule> };
    const roleId = String(body.roleId || "").trim();
    if (!roleId || !body.rule) return NextResponse.json({ success: false, error: "Role and availability rule are required." }, { status: 400 });
    const role = await getRoleRequestById(roleId);
    if (!role || !canViewRole(user, role)) return NextResponse.json({ success: false, error: "Role request not found." }, { status: 404 });
    if (!["Approved", "Recruitment Setup", "Job Posted"].includes(role.status)) return NextResponse.json({ success: false, error: "Availability can only be added for an approved or published role." }, { status: 409 });
    const interviewType = body.rule.interviewType === "Final Interview" ? "Final Interview" : "AI Voice Interview";
    const canEdit = interviewType === "Final Interview"
      ? canEditHodAvailability(user, role)
      : canEditRecruitmentSetup(user);
    if (!canEdit) return NextResponse.json({ success: false, error: "You do not have permission to update this interview availability." }, { status: 403 });
    const rule = cleanRule(role.roleId, body.rule);
    const parsed = parseAvailabilityRules([rule]);
    if (parsed.length !== 1) return NextResponse.json({ success: false, error: "Add a valid recurring schedule or specific interview slots." }, { status: 400 });
    const futureSlots = virtualSlotsForRole({ ...role, interviewAvailabilityRules: JSON.stringify([parsed[0]]) }, parsed[0].interviewType)
      .filter(hasValidFutureTime);
    if (futureSlots.length === 0) {
      return NextResponse.json({ success: false, error: "This schedule creates no future interview times before the target hiring date. Choose an earlier date or a later target hiring date." }, { status: 422 });
    }
    const existing = roleAvailabilityRules(role).filter((item) => !item.ruleId.startsWith("LEGACY-"));
    const merged = [...existing.filter((item) => item.ruleId !== rule.ruleId), parsed[0]];
    if (merged.length > 50) return NextResponse.json({ success: false, error: "A role can have up to 50 active availability rules." }, { status: 400 });
    const updatedAt = new Date().toISOString();
    await updateRoleRequestFields(role.roleId, {
      Interview_Availability_Rules: serializeAvailabilityRules(merged),
      Last_Updated: updatedAt,
      Last_Updated_By_Name: user.name,
      Last_Updated_By_Email: user.email.trim().toLowerCase(),
    });
    return NextResponse.json({ success: true, rule: parsed[0], updatedAt, message: "Availability rule saved successfully." });
  } catch (error) {
    console.error("[API Availability Rules] Save failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to save availability rule." }, { status: 500 });
  }
}
