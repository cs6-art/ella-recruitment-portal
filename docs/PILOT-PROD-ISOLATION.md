# Pilot vs Prod n8n isolation

Goal: run the `HR/Pilot` and `HR/Recruitment Portal` pipelines side by side with
zero cross-contamination of data, email, phone calls, or API quota.

Audited 2026-09-02 from the live n8n instance. IDs are workflow / credential ids.

## What is already isolated ✅

| Axis | Prod | Pilot |
|---|---|---|
| Webhook paths | `candidate-application`, `screening-complete`, `role-request`, `recruitment/voice/results` | all `*-pilot` suffixed — no collision |
| Sheets data | `1J6qadoB07…` (ELAI: HR Resume Screener) | `1tiPTyCWwMQ…` (…- Pilot) + `1kUl6lrwxan…` (pilot Role_Requests) |
| Portal target | prod deploy | pilot deploy / localhost with pilot `.env` |

## What is still SHARED — deficiencies to fix ❌

### 1. Google API credential / quota (highest priority)

Three pilot workflows authenticate with the **prod** OAuth credential
`ELAI` (`Ts9Aim1aQZ6afMW2`) — the same one all 20 prod workflows use:

- `AI Voice Interview Booking Confirmation (Pilot)` `NN8r5PPUktrPkVIr`
- `AI Final Interview Booking Confirmation (Pilot)` `SQgv92WepQCNmAgx`
- `Voice Result Status Sync (Pilot)` `29HvXI7H4eKUJ1Uv`

Sheets API read-quota is **per credential / per user**, not per spreadsheet.
Prod already hits the "read requests per minute per user" ceiling on its own
(see the stalled/duplicate-email incident). Pilot schedulers on the same
credential make both sides throttle each other, and the failure mode is
duplicate candidate emails.

The other pilot workflows are already on non-prod credentials but **three
different ones**, which is its own mess:
- `Google Service Account API` (`Iy87XumbNplScuHN`) — Foundation, Notifier
- `Google Sheets account` OAuth (`ZufKACsgkRgsPdsG`) — Calling, Vapi polling, HR Decision, Role Request

**Fix:** one **dedicated pilot Google service account**, used by all 9 pilot
workflows. Service account (not OAuth) because it gets its own quota project,
has no human-token-refresh dependency, and its Drive scope can be limited to
the pilot spreadsheets. This is *one* SA for the whole pilot — not one per
workflow / per process.

### 2. Gmail sender

Pilot email goes out as a mix of `Gmail account 4` (`P50Wj9l8ryorF0Z7`, the
prod sender) and `Julio` (`J96R6x2t3JGoK0ir`, a personal account):

- `Gmail account 4`: `NN8r5PPUktrPkVIr`, `SQgv92WepQCNmAgx`
- `Julio`: `OnQNFmdMzrZPnLT0`, `rsfQl6nkVWd7Zo3B`, `EYJvn4dVWPDGUh5Q`

Some subjects are prefixed `[PILOT]`, inconsistently. Pick one pilot sending
identity (dedicated mailbox preferred) and use it in all 9. Keep the `[PILOT]`
subject prefix everywhere until the pilot has its own domain.

### 3. Vapi account

`AI Voice Interview Scheduled Calling (Pilot)` `cTJHm2ZAJQap7uWW` calls
`https://api.vapi.ai/call` with `Bearer Auth account` (`tyrWljhBLtzQqoF7`) —
**the same credential prod uses** (`A6M0lIp5YARQ1VDJ`). Assistant / phone-number
ids are pulled from sheet config so they may differ, but the account, billing,
concurrency pool and caller ID are shared. Plan calls for a **separate pilot
Vapi account + assistants + phone number**.

### 4. Shared n8n instance

Everything is one n8n. Acceptable for now given the path/data isolation above,
but every scheduled pilot workflow competes for the same worker pool and (once
#1 is fixed) is still one more cron tick. `docs/CREDIT-PORTAL-PLAN.md` §7 wants
a separate pilot n8n instance before a real customer.

### 5. Cosmetic: stale prod reference

`cTJHm2ZAJQap7uWW` → node `Sync Applicant Voice Call Status`: the active
`documentId.value` is the pilot sheet (correct), but `cachedResultUrl` still
points at prod `1J6qadoB07…`. Not a live write to prod — just misleading. Clear
and re-pick the sheet.

## Does the Postgres migration make this moot?

**No.** Postgres (plan Phase 4) replaces the Sheets *data store*. It does
nothing about shared Google API
credential/quota, shared Gmail, shared Vapi, or shared n8n workers — those are
independent axes and all four need fixing now for "both running without
intermingling". Postgres is also far off; don't wait on it.

## Missing pilot workflows — do you need to duplicate more?

The pilot folder has the **voice-call and result** stages but is missing the
**resume-approval → voice-invitation** bridge and the **booking APIs**:

| Prod workflow | ID | Pilot copy? | Notes |
|---|---|---|---|
| AI Recruitment HR Approval Notifications | `3sv4S9Zb1DUzJbzR` | **missing** | scheduled, single-sheet → must duplicate. Turns `Resume_HR_Decision=approve/reject` into a rejection email or a voice booking token. Without it an approved pilot resume goes nowhere. |
| AI Voice Interview Booking Invitations | `yKb9DvRNahvGAcRO` | **missing** | scheduled, single-sheet → must duplicate. Emails the approved candidate the secure voice-booking link. |
| Recruitment Booking API | `4vCXB8O9rmwVX5To` | **missing** | webhook API. Duplicate **or** teach the prod one to take `spreadsheetId` from the payload (plan §7) and have the pilot portal pass the pilot id. |
| Final Interview Booking API v2 | `6rxRBMgtQ4odrb1m` | **missing** | same choice as above. |
| Recruitment Booking Reservation Cleanup | `Ds2gYCpeJJCM5H6r` | **missing** | scheduled, single-sheet → duplicate if the pilot uses slot reservations. |
| McLink - Application Invite Email | `JQPQvZyzbyyMI1FD` | **missing** | only if the pilot invites candidates by email link. |
| AI Role Description Parser | `eo6jK6OzrI5CHvAE` | **missing** | only if pilot HR uploads JD files. |
| Publish Role to Portal Sheets | `1BxD9VwXMvX98cHh` | check | may be folded into `EYJvn4dVWPDGUh5Q` (it has "Update Recruitment Setup" nodes). |

Rule of thumb: **scheduled workflows** (they read one hard-coded sheet every
tick) must be duplicated per environment. **Webhook APIs** should instead accept
`spreadsheetId`/`orgId` in the request and stay single copies — that is the
Phase 1 design in the plan and avoids a growing pile of `(Pilot)` duplicates.

## Prompt to hand the pilot-isolation work

> Audit and fix the 9 workflows tagged `recruitment-pilot` in n8n
> (`HR/Pilot` folder) so the pilot pipeline is fully isolated from the
> `recruitment-prod` workflows. Specifically:
>
> 1. Repoint every Google Sheets node in all 9 pilot workflows to a single
>    dedicated pilot Google **service-account** credential (I will create it and
>    give you the credential id / SA email; it will have access only to the
>    pilot spreadsheets `1tiPTyCWwMQGnXdCpFle70wmfHJNz6YZ2_bWFVqOxko4` and
>    `1kUl6lrwxanKPvGifcE1uF5NuJ9fseJb_L5nKN3YM78g`). Remove all use of the
>    `ELAI` (`Ts9Aim1aQZ6afMW2`), `Google Service Account API`
>    (`Iy87XumbNplScuHN`) and `Google Sheets account` (`ZufKACsgkRgsPdsG`)
>    credentials from the pilot workflows.
> 2. Point every Gmail node in the pilot workflows at the dedicated pilot
>    mailbox credential (id to follow) and make sure every candidate-facing
>    subject line is prefixed `[PILOT]`.
> 3. In `AI Voice Interview Scheduled Calling (Pilot)` (`cTJHm2ZAJQap7uWW`):
>    switch the Vapi HTTP node to the pilot Vapi bearer credential (id to
>    follow), and clear the stale prod `cachedResultUrl`
>    (`1J6qadoB07…`) on the `Sync Applicant Voice Call Status` node — the
>    active sheet must be the pilot workbook only.
> 4. Give every Google Sheets node `retryOnFail` (5 tries / 5000 ms) and keep
>    completion-writer nodes on `onError: continueRegularOutput`; no scheduled
>    pilot workflow may poll faster than every 5 minutes.
> 5. Confirm no pilot webhook path or schedule overlaps a prod workflow, and
>    that no pilot node references prod spreadsheet `1J6qadoB07…` or prod
>    webhook paths.
> 6. Build the missing pilot workflows: duplicate
>    `AI Recruitment HR Approval Notifications` (`3sv4S9Zb1DUzJbzR`) and
>    `AI Voice Interview Booking Invitations` (`yKb9DvRNahvGAcRO`) as
>    `… (Pilot)` copies wired to the pilot sheet, credentials and mailbox, on a
>    5-minute schedule, subject prefix `[PILOT]`. For the booking APIs
>    (`4vCXB8O9rmwVX5To`, `6rxRBMgtQ4odrb1m`) tell me whether to duplicate them
>    or extend the prod versions to accept a `spreadsheetId` payload field.
> 7. Report anything else that still couples pilot to prod.
