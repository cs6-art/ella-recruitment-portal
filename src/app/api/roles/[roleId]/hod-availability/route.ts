import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canEditHodAvailability, canViewRole } from "@/lib/access-control";
import {
  isHodAvailabilitySlot,
  legacyAvailabilityDates,
  legacyAvailabilityTimes,
  serializeHodAvailabilitySlots,
  type HodAvailabilitySlot,
} from "@/lib/hod-availability";
import { getRoleRequestById, updateRoleRequestFields } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roleId: string }> };

export async function POST(request: Request, context: Context) {
  const user = verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  const { roleId: encodedRoleId } = await context.params;
  const roleId = decodeURIComponent(encodedRoleId);
  const role = await getRoleRequestById(roleId);
  if (!role || !canViewRole(user, role)) return NextResponse.json({ success: false, error: "Role request not found." }, { status: 404 });
  if (!canEditHodAvailability(user, role)) return NextResponse.json({ success: false, error: "Only HR or the assigned HOD can update availability." }, { status: 403 });
  if (!["Approved", "Recruitment Setup", "Job Posted"].includes(role.status)) {
    return NextResponse.json({ success: false, error: "HOD availability can only be updated for an approved or active recruitment role." }, { status: 409 });
  }

  try {
    const body = await request.json() as { slots?: unknown };
    if (!Array.isArray(body.slots) || body.slots.length > 50 || !body.slots.every(isHodAvailabilitySlot)) {
      return NextResponse.json({ success: false, error: "Add valid date, start time, end time, and timezone for every HOD availability window." }, { status: 400 });
    }

    const slots = body.slots.map((slot) => ({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      timezone: slot.timezone.trim(),
    })) as HodAvailabilitySlot[];
    const duplicateKeys = new Set<string>();
    if (slots.some((slot) => {
      const key = `${slot.date}|${slot.startTime}|${slot.endTime}|${slot.timezone}`;
      if (duplicateKeys.has(key)) return true;
      duplicateKeys.add(key);
      return false;
    })) {
      return NextResponse.json({ success: false, error: "Remove duplicate HOD availability windows before saving." }, { status: 400 });
    }

    const updatedAt = new Date().toISOString();
    await updateRoleRequestFields(role.roleId, {
      HOD_Availability_Dates: legacyAvailabilityDates(slots),
      HOD_Availability_Times: legacyAvailabilityTimes(slots),
      HOD_Availability_Slots: serializeHodAvailabilitySlots(slots),
      Last_Updated: updatedAt,
      Last_Updated_By_Name: user.name,
      Last_Updated_By_Email: user.email.trim().toLowerCase(),
    });

    return NextResponse.json({ success: true, slots, updatedAt, message: "HOD availability updated successfully." });
  } catch (error) {
    console.error("[API HOD Availability] Update failed:", error instanceof Error ? { name: error.name, message: error.message } : error);
    return NextResponse.json({ success: false, error: "Unable to update HOD availability." }, { status: 500 });
  }
}
