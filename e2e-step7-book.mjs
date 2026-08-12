const BASE = "http://127.0.0.1:3000";
const token = "YjeMLxNenS2oZdYIcJJKsDl3EqMlMpYKnxhtmgRfgBsw80IPD2eEduxSDUm2MAux";

console.log("=== Fetch booking context ===");
const ctxRes = await fetch(`${BASE}/api/public/bookings/voice/${token}`);
const ctx = await ctxRes.json();
console.log(ctxRes.status, JSON.stringify(ctx, null, 2));

if (!ctx.success || !ctx.context.slots.length) { console.error("No slots available"); process.exit(1); }
const slotId = ctx.context.slots[0].slotId;

console.log("\n=== Reserve slot", slotId, "===");
const bookRes = await fetch(`${BASE}/api/public/bookings/voice/${token}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ slotId, preferredMobile: "+639663551040" }),
});
const book = await bookRes.json();
console.log(bookRes.status, JSON.stringify(book, null, 2));
