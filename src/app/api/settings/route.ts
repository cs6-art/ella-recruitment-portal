import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { defaultPortalSettings, getPortalSettings, upsertPortalSettings } from "@/lib/google-sheets";
import { consumeRateLimit, rateLimitHeaders, requestClientKey } from "@/lib/rate-limit";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingSchema = z.object({ key: z.string().trim().min(1).max(200), value: z.string().max(10000), category: z.string().trim().max(100), description: z.string().max(1000), updatedAt: z.string().optional(), updatedBy: z.string().optional() });
const settingsSchema = z.object({ settings: z.array(settingSchema).max(500) });
const secretKey = (key: string) => /(secret|password|token|private.?key|credential|api.?key)/i.test(key);

async function currentUser() {
  return verifySessionToken((await cookies()).get(COOKIE_NAME)?.value);
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (user.canEditSettings !== true) return NextResponse.json({ success: false, error: "Settings permission required." }, { status: 403 });
  try {
    const stored = await getPortalSettings();
    const storedByKey = new Map(stored.map((setting) => [setting.key, setting]));
    const settings = [...defaultPortalSettings.map((setting) => storedByKey.get(setting.key) || setting), ...stored.filter((setting) => !defaultPortalSettings.some((defaultSetting) => defaultSetting.key === setting.key))]
      .filter((setting) => !secretKey(setting.key))
      .map((setting) => ({ ...setting, value: secretKey(setting.key) ? "" : setting.value }));
    return NextResponse.json({ success: true, settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[API Settings] GET failed:", error);
    return NextResponse.json({ success: false, error: "Unable to load portal settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (user.canEditSettings !== true) return NextResponse.json({ success: false, error: "Settings permission required." }, { status: 403 });
  const rate = consumeRateLimit(`settings:${user.email}:${requestClientKey(request)}`, 30, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many settings updates. Try again later." }, { status: 429, headers: rateLimitHeaders(rate) });
  try {
    const input = settingsSchema.parse(await request.json());
    const existing = await getPortalSettings();
    const submitted = new Map(input.settings.map((setting) => [setting.key, setting]));
    const merged = existing.map((setting) => secretKey(setting.key) ? setting : (submitted.get(setting.key) || setting));
    for (const setting of input.settings) if (!existing.some((current) => current.key === setting.key) && !secretKey(setting.key)) merged.push({ ...setting, updatedAt: new Date().toISOString(), updatedBy: user.name });
    await upsertPortalSettings(merged.map((setting) => ({ ...setting, updatedAt: new Date().toISOString(), updatedBy: user.name })));
    return NextResponse.json({ success: true, message: "Settings saved successfully." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Invalid settings payload." }, { status: 400 });
    console.error("[API Settings] PUT failed:", error);
    return NextResponse.json({ success: false, error: "Unable to save portal settings." }, { status: 500 });
  }
}
