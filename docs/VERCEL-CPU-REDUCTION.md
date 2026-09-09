# Vercel Fluid Active CPU reduction

Goal: **near-zero Vercel CPU while nobody is using the portal.** The portal is a
thin UI over Google Sheets; almost all steady-state cost came from background
work running on warm serverless instances, not from real traffic.

## Root cause

`src/instrumentation.ts` `register()` runs once per **warm serverless
instance**. It started three recurring timers:

| Job | Old cadence | Cost per run |
|---|---|---|
| `syncPastBookedInterviewsNoShow()` | every 5 min | reads `Interview_Slots`, `High_Match_Profile` (A:CZ), `Voice_Interview_Results`, `Voice_Call_Logs`, `Final_Interview_Tracking`, `Candidate_Status_History`, `Voice_Call_Queue` + O(n²) in-memory reconciliation |
| `syncPastAvailableInterviewSlots()` | every 5 min | reads `Interview_Slots` |
| `cleanupExpiredResumeFiles()` | every 60 min | paginated Drive `files.list` |

Because the timers live on the instance, they ran on **every warm instance in
parallel** and on **every Preview deployment**, each against the shared
production spreadsheet — so idle CPU and Sheets read-quota scaled with the
number of warm instances, not with usage. The only caller of these functions
was `instrumentation.ts`; nothing triggered them on-demand.

## What changed

### 1. Timers removed from the serverless runtime
`src/instrumentation.ts` `register()` is now empty. No `setInterval` /
`setTimeout`. Nothing schedules background work on a warm instance.

### 2. One controlled scheduler → one protected endpoint
New route: `POST /api/internal/maintenance` (`src/app/api/internal/maintenance/route.ts`).

- Auth: `x-internal-secret: $INTERNAL_API_SECRET` (or `Authorization: Bearer …`),
  constant-time compared. Missing/blank secret ⇒ `401`.
- **Preview-safe:** returns `403` when `VERCEL_ENV === "preview"` even with a
  valid secret (`isBackgroundMaintenanceAllowed()` in `src/lib/deployment-env.ts`).
- Idempotent: every job only reconciles already-past-due state and has its own
  in-flight guard; overlapping calls are harmless.
- Body `{ "jobs": [...] }` optional; no body runs all three in sequence.
- `resume-cleanup` is skipped in demo mode (matches the pre-cron behaviour).

### 3. n8n scheduler (the single executor)

Import `integrations/n8n/portal-maintenance-scheduler.json` into the
`HR/Recruitment Portal` folder. It is a Schedule Trigger → HTTP Request:

- Schedule: every 15 minutes (interview sync) + a daily 02:00 call with
  `{"jobs":["resume-cleanup"]}`.
- URL: edit the HTTP Request node — replace `REPLACE-WITH-PROD-PORTAL-ORIGIN`
  with the production portal origin (no trailing slash).
- Auth: create an n8n **Header Auth** credential named
  `Portal internal maintenance secret` with **Name** `x-internal-secret` and
  **Value** = the portal's `INTERNAL_API_SECRET`, then attach it to the node.
- No n8n environment variables are required. The portal's own
  `N8N_BULK_RESUME_PORTAL_BASE_URL` is a Vercel variable read by the portal —
  n8n cannot see it — so the origin is set directly on the node instead.
- **Only create this in the production n8n project.** Do not create a
  `*-pilot` copy — pilot/preview must not run maintenance (see
  `docs/PILOT-PROD-ISOLATION.md`).

### 4. Env var

One **new** variable, added to the **production** Vercel environment only (not
Preview/Development):

```
INTERNAL_API_SECRET=<32+ random bytes, hex>
```

Nothing else. `VERCEL_ENV` is set automatically by Vercel. The maintenance
route reads no base-URL variable.

### 5. Notification polling
`src/components/notification-feed.ts`: background poll `180_000ms → 900_000ms`
(3 min → 15 min). The timer already only fires while the tab is visible; a
focus/visibilitychange refresh (cache-respecting, 25s TTL) gives an immediate
update when HR returns to the tab.

### 6. Sheets CPU cost of `syncPastBookedInterviewsNoShow`
- Replaced the per-slot `applicantsData.rows.findIndex(...)` (O(slots × applicants),
  with a fresh `.toLowerCase()` per cell) with a single `Map<applicationId, index>`
  built once.
- `Voice_Call_Queue` and `Final_Interview_Tracking` are grouped into
  `Map<applicationId, rows[]>` once instead of `.map().filter()` re-scanned per
  matching slot.
- Voice/final result lookups for `hasCompletedInterviewResult` use the same
  pre-built groups.
- `todayInTimezone()` memoised per timezone instead of recomputed twice per slot.

> Not changed: the `High_Match_Profile` `A:CZ` read width and the
> `Voice_*`/`Final_*` read widths are shared with other code paths and column
> positions are not statically known — narrowing them safely needs a header
> audit and is tracked separately. Resume parsing and active bulk-screening
> polling are untouched (item 8).

## Before / after (steady state, nobody using the portal)

Assumes ~3 warm instances during working hours, 1 Preview deployment warm.

| Metric | Before | After |
|---|---|---|
| Maintenance executions / hour | ~4 warm instances × (12 interview-sync + 1 cleanup) ≈ **52/hr** | **4/hr interview-sync + ~0.04/hr cleanup** (1 scheduler) |
| Sheets reads / hour (maintenance) | ~4 × 12 × ~7 tabs ≈ **340/hr** (+ cleanup Drive pages) | 4 × ~7 ≈ **28/hr** |
| Idle Vercel Active CPU | continuous: timer wakeups + Sheets JSON parse on every warm instance every 5 min | **~0** — no wakeups; CPU only when the scheduler calls (4×/hr, one instance) |
| Notification API calls / open tab / hour | 20 (every 3 min) | 4 (every 15 min), visible tabs only |
| Preview deployment background work | ran the full timer set against prod Sheets | **none** (403) |

Estimated idle CPU reduction: **~95%+** — idle background execution goes from
"every warm instance, every 5 minutes, forever" to "nothing", with the actual
reconciliation preserved on a single 15-minute external trigger.

## Validation performed

- `node --test tests/*.test.mjs` — 161 pass
- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (pre-existing warnings only)
- `npm run build` — compiled; `/api/internal/maintenance` registered as a
  dynamic function
- New `tests/maintenance-route.test.mjs` covers: no timers in instrumentation,
  secret gate + preview 403, slow visible-only notification polling, indexed
  no-show sync.
