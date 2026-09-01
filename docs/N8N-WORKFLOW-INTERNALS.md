# n8n workflow internals — voice/final interview pipeline

Behavioral summaries of the seven heavy production workflows that drive the AI
voice interview and final (HOD) interview stages. Node-by-node transcription is
deliberately omitted; this records what each stage does, the key branching
logic, and the sheet/provider contracts. Read alongside
[`N8N-CONTRACTS.md`](N8N-CONTRACTS.md) (payload contracts) and
[`WORKING-RECRUITMENT-WORKFLOW.md`](WORKING-RECRUITMENT-WORKFLOW.md) (the
end-to-end production path). Captured 2026-08-28 from the live n8n instance
(`n8n.srv1457709.hstgr.cloud`).

## Shared facts

- **Workbook**: `1J6qadoB07aliQWtV8uykEYW7ENjNOf0nsZ_iTt9g8KM` ("ELAI: HR Resume
  Screener"). Sheet gid `1396336152` is `High_Match_Profile` (the applicant
  row). Other tabs used: `Voice_Interview_Results`, `Voice_Call_Queue`,
  `Voice_Call_Logs`, `Interview_Slots`, `Role_Requests`.
- **Credentials**: Google Sheets = `ELAI` (`Ts9Aim1aQZ6afMW2`). Gmail =
  `Gmail account 4` (`P50Wj9l8ryorF0Z7`).
- **Demo safety cutoff**: `2026-08-20T00:00:00+08:00`. Filter/gate code in the
  scheduled workflows drops rows whose application timestamp is before the
  cutoff, rows flagged `Is_UAT`, and rows that look synthetic (`DEMO-`/`SYNTH-`/
  `DUMMY-` id prefixes, `demo`/`test`/`dummy`/`synthetic` in name or source,
  `@example.com`/`@example.test` email).
- **`DEMO_MODE` env**: when `true`, the four webhook APIs below refuse every
  request with `code: demo_mode` before doing any work.
- Every Sheets-writing node in the scheduled workflows runs `continueOnFail`
  where a write is non-critical, and uses a mark → re-read → confirm guard
  pattern before sending email or dialing, so a duplicate scheduler tick cannot
  double-send.

---

## 1. AI Recruitment HR Approval Notifications — `3sv4S9Zb1DUzJbzR`

**Trigger**: schedule, every 2 minutes. 27 nodes. Active.

Turns an HR resume decision (`Resume_HR_Decision` = `approve`/`reject` on
`High_Match_Profile`) into either a rejection email hand-off or a secure voice
booking token.

**Flow**
1. Read all `High_Match_Profile` rows → normalize (`Resume_HR_Decision`,
   `Rejection_Email_Sent`, `Voice_Interview_Invitation_Sent`, email, name,
   role; flags invalid decisions and `Is_UAT`).
2. **Filter Actionable Applicants**: keep non-UAT rows with a valid decision
   where either `decision=reject` and `Rejection_Email_Sent ∈ {'', pending,
   error}`, or `decision=approve` and `Voice_Interview_Invitation_Sent ∈ {'',
   pending, error}`.
3. `splitInBatches` one at a time → **Route Resume HR Decision** (reject vs
   approve).
4. **Reject branch**: validate email format → `Rejection_Email_Sent = Sending`
   → re-read row → confirm the flag actually says `Sending` (guard) → on pass,
   write terminal rejection state: `Status (Resume Processing) = Rejected`,
   `Final_Status = Rejected After Resume Review`,
   `Rejection_Email_Sent = Skipped`. Invalid email → `Rejection_Email_Sent =
   Error` with `Email_Processing_Error`. **Note:** this workflow marks the
   rejection `Skipped`/complete but does not itself send the rejection email —
   the actual send is elsewhere. The reject path here is really a state
   transition + guard.
5. **Approve branch**: `Booking_Token_Status = Processing` → re-read → confirm
   guard → `crypto` generate 64-byte base64 token → `crypto` SHA-256 hash it →
   **Prepare Booking Token Metadata** builds `Booking_Token`,
   `Booking_Token_Hash`, `Booking_Token_Status = Active`, created/expiry
   (expiry = now + 7 days), `Voice_Interview_Booking_Status = Awaiting Booking
   System`, `Voice_Interview_Invitation_Sent = Pending`.
6. **Mark Applicant Awaiting Booking System** writes the full approved state:
   `Status (Resume Processing) = Processed`, `Status 2 (Voice Interview) =
   Awaiting Schedule`, `Final_Status = Approved for AI Voice Interview`, plus
   all token columns.
7. Token/hash failure or missing email → `Booking_Token_Status = Error` with
   `Booking_Invitation_Error`.

The raw token is written to the sheet (`Booking_Token`) here; workflow 2 reads
it back to build the emailed URL, and the booking API (workflow 3) only ever
matches on `Booking_Token_Hash`.

---

## 2. AI Voice Interview Booking Invitations — `yKb9DvRNahvGAcRO`

**Trigger**: schedule, every 5 minutes. 14 nodes. Active.
Self-description: "Retries stale voice interview invitation sends and emails
approved candidates a secure production booking link."

All five Google Sheets nodes retry on failure (5 tries, 5s apart); the two
completion writers (`Mark Invitation Complete`, `Record Invitation Error`) also
`onError: continueRegularOutput` so a persistent `sheets.googleapis.com` quota
error can no longer abort the run mid-batch and strand a row at `Sending`.

**Flow**
1. Read `High_Match_Profile` → **Filter Invitation Applicants**: demo-safety
   gate, then keep rows where `Resume_HR_Decision = approve`,
   `Voice_Interview_Booking_Status = Awaiting Booking System`,
   `Booking_Token_Status = Active`, token present and not expired, valid email,
   and `Voice_Interview_Invitation_Sent ∈ {'', Pending, Error}` **or**
   `Sending` older than 30 minutes (stale-send retry). Any row that already has
   a `Voice_Interview_Booking_Link` is skipped outright — the invite email
   definitely went out, so it must never be resent.
2. `splitInBatches` → `Voice_Interview_Invitation_Sent = Sending` (+ date) →
   re-read row → **Prepare Booking Invitation**: if already booked
   (`Voice_Interview_Scheduled_Date` set or status `booked`) short-circuit with
   `invitation_error = ALREADY_BOOKED`; if the row is already `Yes` or already
   carries a booking link, short-circuit with `invitation_error = ALREADY_SENT`
   (idempotency guard against a stale read); otherwise build
   `booking_url = https://ella-recruitment.mclinkgroup.com/book/voice/<token>`.
3. Guard passed → **Send AI Voice Interview Invitation** (Gmail account 4).
   Subject "Schedule your AI voice interview with McLink Group". HTML body has
   the styled booking button and the verbatim **AI Interview Notice**.
4. Evaluate result → on success `Voice_Interview_Booking_Status = Invitation
   Sent`, `Voice_Interview_Booking_Link = <url>`,
   `Voice_Interview_Invitation_Sent = Yes`. On failure
   `Voice_Interview_Invitation_Sent = Error` + `Booking_Error`. The
   `ALREADY_BOOKED` case instead flips the row to `Booked` /
   `Booking_Token_Status = Used` and clears the error; the `ALREADY_SENT` case
   flips `Voice_Interview_Invitation_Sent = Yes` and clears the error without
   sending anything.

---

## 3. Recruitment Booking API — `4vCXB8O9rmwVX5To`

**Triggers**: two webhooks (no auth; CORS `Access-Control-Allow-Origin:
https://ellai.mclinkgroup.com`, `Cache-Control: no-store`). 39 nodes. Active.
This is the API the candidate `/book/voice/<token>` page calls.

- `GET  /webhook/recruitment/booking/availability?token=<raw token>`
- `POST /webhook/recruitment/booking/reserve` — body `{ token, slot_id,
  timezone }`

### Availability path
1. **Prepare Availability Request**: reject if `DEMO_MODE`, else require token
   matching `^[A-Za-z0-9_-]{24,256}$`.
2. `crypto` SHA-256 the token → read `High_Match_Profile` → **Validate
   Availability Applicant**: find row by `Booking_Token_Hash`; reject `Is_UAT`
   (`uat_guard`); require `Booking_Token_Status = Active`, not expired,
   `Resume_HR_Decision = approve`, `Voice_Interview_Booking_Status ∈ {Awaiting
   Booking System, Invitation Sent}` (else `already_booked`).
3. Read `Interview_Slots` → **Build Normalized Availability Response**: keep
   `Interview_Type = "AI Voice Interview"` (case-insensitive), `Status =
   Available`, role match (blank slot `Role_ID` = any role), timezone in
   {`Asia/Manila`, `Asia/Singapore`}, start instant in the future. Returns
   `{ success, code, applicant:{first_name, role}, slots:[{slot_id, date,
   start_time, end_time, timezone}] }`; empty list → `code: no_slots`.
   (An older `Build Safe Availability Response` node still exists in the canvas
   but is not wired in.)
4. Errors return `{ success:false, code }` via **Return Availability Error**.

### Reserve path (optimistic-lock, 5-minute reservation)
1. **Prepare Reservation Request**: `DEMO_MODE` gate; validate token regex,
   `slot_id` (`^[A-Za-z0-9_-]{1,80}$`), timezone in the two allowed zones.
2. Hash token → read `High_Match_Profile` → **Validate Reservation Applicant**
   (same rules as availability; distinguishes `expired_token` vs
   `already_booked` vs `invalid_token`).
3. Read `Interview_Slots` → **Prepare Slot Reservation**: re-check the target
   slot is `Available` + correct type + role; mint a `reservation_token`
   (`<ms>-<rand>`), `reserved_at`, `reservation_expires_at` = +5 min.
4. **Mark Slot Reserved** (`Status = Reserved`, token/expiry) → **Re-read
   Reserved Slot** → **Confirm Slot Reservation**: the row must show `Reserved`
   with a matching `Reservation_Token`, else `reservation_lost`.
5. Token matches → **Update Applicant Booking**: `Status 2 (Voice Interview) =
   Scheduled`, `Voice_Interview_Booking_Status = Booked`, scheduled
   date/time/timezone, `Booking_Token_Status = Used`, `Booking_Completed_At`,
   `Final_Status = AI Voice Interview Scheduled`,
   `Voice_Interview_Confirmation_Email_Sent = Sending`.
   Token mismatch → **Release Failed Reservation** puts the slot back to
   `Available` and returns `booking_failed`.
6. **Finalize Booked Slot** (`continueOnFail`): slot row → `Status = Booked`
   with `Application_ID`, candidate name/email, `Booked_At`.
7. **Create Voice Call Queue Record**: append a `Voice_Call_Queue` row —
   `Voice_Call_Status = Scheduled`, `Voice_Call_Attempts = 0`,
   `Voice_Call_Max_Attempts = 1`, scheduled date/time/timezone, contact number,
   `Applicant_Country`, `Role_ID`, empty lock/provider fields.
8. **Send Booking Confirmation Email** — Gmail account 4 — **is `disabled`**.
   The confirmation email is sent by the separate "AI Voice Interview Booking
   Confirmation" workflow (`If1HFQmMY9AeFUiz`), which reads the `Sending` flag.
   The remaining nodes still evaluate a (non-)result and set
   `Voice_Interview_Confirmation_Email_Sent = Yes`/`Error`, then respond
   `{ success:true, email_delivery_delayed }`.

> The queue row it writes hardcodes `Voice_Call_Max_Attempts = 1`, but the
> retry logic in workflows 4 and 5 defaults a missing/zero value to `3`. In
> practice the "1" written here is what limits redials unless something raises
> it.

---

## 4. AI Voice Interview Scheduled Calling — `A6M0lIp5YARQ1VDJ`

**Trigger**: schedule, every 1 minute. 37 nodes. Active.
Self-description: "Polls booked voice interviews, resolves the role-specific
Ella prompt and evaluation fields, starts Vapi calls, and syncs call status."

**Flow**
1. Read `Voice_Call_Queue` + `High_Match_Profile` → **Join Queue with Applicant
   Profiles** by `Application ID` (queue values win over profile except blanks).
2. **Normalize Queue/Scheduled Times**: trim `HH:MM:SS`→`HH:MM`; build
   `scheduled_at_iso` only for timezones {`Asia/Manila`, `Asia/Singapore`}
   (both `+08:00`); compute `lock_expired` = status `Calling` + lock expiry in
   the past + no `Voice_Call_ID`.
3. **Filter Calls Due**: demo-safety gate; a row is base-eligible when
   `Resume_HR_Decision = approve`, `Voice_Interview_Booking_Status = booked`,
   `Booking_Token_Status = used`, `Status 2 (Voice Interview) = scheduled`,
   valid scheduled instant, a contact number, and
   `Voice_Call_Status ∈ {'', pending, retry, scheduled}`. Timing: `due` if
   scheduled within the last 15 min, `missed` if 15–30 min late, dropped if
   >30 min late or in the future. `lock_expired` rows always pass, tagged
   `expired_lock`.
4. Read `Role_Requests` → **Merge Current Queue and Applicant**: for each due
   row find the `Role_ID` row and resolve the **Ella system prompt**:
   `ella_system_prompt` → `VAPI_Resolved_System_Prompt` → `AI_System_Prompt`
   → a built-in fallback prompt template. Placeholders (`{{candidate_name}}`,
   `{{role}}`, `{{job_description}}`, `{{screening_criteria}}`,
   `{{interview_questions}}`, `{{match_score}}`, `{{ai_summary}}`, …) are
   rendered here. Also builds the Vapi **structured-data schema**: a fixed set
   of properties (`status`, `interview_completed`, `answered_question_count`,
   `hr_summary`, `interview_evidence`, `voice_score`, `voice_recommendation`,
   `decision_rationale`, `voice_strengths`, `voice_concerns`,
   `communication_quality`, `answer_completeness`,
   `recommended_follow_up_questions`, `summary`) plus one property per role
   `Evaluation_Fields` entry, with a merged `required` list.
5. `splitInBatches` → **Call Is Due?** (`due` vs `missed`/`expired_lock`).
6. **Due branch**:
   - **Validate Applicant Phone**: normalize `Contact Number` to E.164 by
     `Applicant_Country` — PH (`+63`), SG (`+65`, first digit 3/6/8/9), MY
     (`+60`), SA (`+966`). Bad/unknown → `Voice_Call_Status = Error` with the
     reason.
   - **Confirm Applicant Before Call**: full eligibility re-check against the
     freshly-read row (unique queue+profile row, still approved/booked/used/
     scheduled, no `Voice_Call_ID`, scheduled instant already passed).
   - **Build/Mark/Verify/Confirm Voice Call Lock**: mint `<ms>-<rand>` lock,
     +5 min expiry, `Voice_Call_Status = Calling`, re-read, confirm exactly one
     row shows `Calling` + matching lock + no call ID + unexpired.
   - **Prepare Voice Provider Request**: pick Vapi assistant + phone-number IDs
     by country — **PH** `assistant e5934be9…`, **SG & MY** both use the
     Singapore pair (`assistant 4698fa1c…`). Missing/placeholder config →
     `Record Provider Configuration Error`.
   - **Initiate AI Voice Call**: `POST https://api.vapi.ai/call` with
     `assistantId`, `phoneNumberId`, `maxDurationSeconds: 600`,
     `customer.number = phone_e164`, and
     `assistantOverrides.variableValues` (all the rendered prompt vars incl.
     `application_id`, `ella_system_prompt`, `system_prompt`) +
     `assistantOverrides.analysisPlan.structuredDataPlan.schema` from step 4.
   - **Evaluate Provider Response** → needs a call id. Success →
     **Mark Voice Call Initiated** (`Voice_Call_Status = Initiated`,
     `Voice_Call_ID`, `Voice_Call_Attempts += 1`) → **Sync Applicant Voice
     Call Status** (`Status 2 = Calling`, `Final_Status = AI Voice Interview In
     Progress`). Failure → `Record Voice Call Initiation Error`
     (`Voice_Call_Status = Error`, clears lock, `Attempts += 1`).
   - Any failed guard on the way (phone, eligibility, lock) → **Skip Applicant
     Safely** → `Record Safe Skip` (`Voice_Call_Status = Error` + reason).
7. **Missed / expired-lock branch**: `Voice_Call_Status = Missed` (missed
   window) or `Error` with "Expired call lock found; manual reset to Retry is
   required" (expired lock — no automatic recovery here).

Vapi auth for the HTTP node is a predefined credential on the node, not in the
request body.

---

## 5. Phase 5 — Scheduled Vapi Result Polling — `IsGpeZUaeNN1VLC3`

**Trigger**: webhook `POST /webhook/recruitment/voice/results` (Vapi
end-of-call webhook target). 11 nodes. Active.
Self-description: "Polls completed Vapi interviews and writes consistent
transcript-based HR results, including reliable completion detection."
(Despite "Polls", it is webhook-driven; `JKv9cdP7ihejhl9D` "Voice Result Status
Sync" is the separate 2-minute poller.)

**Flow**
1. **Normalize End of Call Report**: accept only `message.type =
   "end-of-call-report"`; pull `call`, `artifact`, `analysis`,
   `assistantOverrides.variableValues`; merge every possible
   `structuredOutput(s)`/`structuredData` location into one object; extract
   `application_id` (from variables) and `provider_call_id` (from `call.id`).
   Non-matching events return `[]` (no-op 200).
2. **End of Call Result Ready?** requires both `application_id` and
   `provider_call_id`.
3. Read `High_Match_Profile` row by `Application ID` → read `Voice_Call_Queue`
   row by `Application_ID` → **Merge Applicant and Call Result**. Carries
   `queue_voice_call_attempts` (already includes this call — the dialer
   increments at initiation) and `queue_voice_call_max_attempts`.
4. **Prepare Final Result** — the core evaluator, all local (no LLM call):
   - Splits configured `Interview Questions`; if none, infers questions from
     `?`-terminated AI turns in the transcript (excluding greeting/"good time"
     prompts).
   - **`answerEvidence`**: walks the transcript turn-by-turn matching each
     question to the nearest AI turn by keyword overlap (stop-word filtered),
     then takes the next `user` turn as the answer, skipping
     clarification-only replies ("can you repeat that") and the AI's re-ask.
   - **Completion**: `completed` only if `call_completed_at` present **and**
     answered ≥ expected question count **and** (a completion signal in the
     structured output **or** the event is an end-of-call-report). Local
     answered count is preferred over Vapi's `answered_question_count` (see
     `KNOWN-ISSUES.md` #4).
   - **Normalized outcome**: `Completed` / `Incomplete` / `No Answer` / `Busy`
     / `Rejected` / `Call Back` / `Wrong Person` from status + `endedReason`.
   - **Scoring guard**: a `voice_score` / `voice_recommendation` is only kept
     when there is a real gradable transcript (non-empty, ≥1 answered, outcome
     not No Answer/Busy/Wrong Person). Otherwise score is blank and the
     recommendation/summary are generated from resume context + heuristics
     (brief-answer detection, resume strengths/gaps). The portal renders that
     blank score as `0%` (not "Awaiting AI evaluation") once the call outcome
     is terminal — Incomplete / No Answer / Busy / Wrong Person / Rejected /
     Call Back — since an applicant who answered nothing did not score
     (`voiceInterviewEndedUngraded` in `candidate-applications.ts`).
   - **Retry decision**: for `No Answer`/`Busy`, if
     `0 < attemptsSoFar < maxAttempts` (max defaults to 3 when unset) →
     `retry_scheduled`: compute a +30-minute retry slot in the applicant
     timezone, set `Status 2 = Scheduled`, `Final_Status = "Voice Interview
     Attempt N of M (…) - Retry Scheduled"`. If attempts exhausted →
     `Status 2 = Interviewed`, `Final_Status = "… Unable to Reach After M
     Attempts - For HR Review"`, `Voice_HR_Decision = Pending`.
   - Completed / ≥3 answered → `Status 2 = Interviewed`, `Final_Status =
     "Voice Interview Completed - For HR Review"` (or `Incomplete …`),
     `Voice_HR_Decision = Pending`.
   - Forwards the optional catalog fields (`culture_fit`,
     `leadership_potential`, `customer_service_orientation`, `technical_depth`,
     `problem_solving`, `attention_to_detail`, `reliability`) and packs any
     unknown/custom field keys into `Additional_Evaluation_Fields_JSON`.
5. **Append or Update Voice Call Log** (`Voice_Call_Logs`, appendOrUpdate on
   `Call_ID`) — full transcript, recording URL, summary, all evaluation fields.
6. **Append or Update Voice Interview Result** (`Voice_Interview_Results`,
   appendOrUpdate) — `Call_Status`, `Call_Final_Status`, transcript, per-field
   columns (`Culture_Fit`, `Technical_Depth`, …) plus
   `Additional_Evaluation_Fields_JSON`. This is the row workflow 6 reads.
7. **Update Voice Call Queue Final**: `Voice_Call_Status = Retry` (if
   re-queued) else the normalized status; on retry it rewrites the scheduled
   date/time and clears `Voice_Call_ID` + lock.
8. **Update Applicant Voice Result** (`High_Match_Profile`):
   `Voice_HR_Decision`, `Status 2 (Voice Interview)`, `Final_Status`.

---

## 6. Voice Interview HR Decision v2 — Hashed Final Booking Token — `4FsKYuSxyaKxFtsM`

**Trigger**: schedule, every 2 minutes (`skipDurableScheduler`, 120s execution
timeout). 34 nodes. Active.
Self-description: "Processes voice interview HR decisions, sends final interview
booking invitations, and retries only recoverable, unexpired processing
states."

**Flow**
1. Read `Voice_Interview_Results` + `High_Match_Profile` (the latter
   `executeOnce`) → **Normalize High Match HR Decisions** (`Voice_HR_Decision`
   → `Approve`/`Reject`/`Pending`/`Invalid`; capture
   `Voice_Rejection_Email_Sent`, `Voice_Approval_Processed`).
2. **Match HR Decision with Voice Result**: join each applicant to its
   `Voice_Interview_Results` row(s), preferring one with `Call_Final_Status =
   completed` and `Call_Status = completed`, else the most recent.
3. **Filter Voice HR Actions** (the gatekeeper):
   - demo-safety + synthetic gate;
   - skip rows that already have a completed final booking
     (`Final_Interview_Booking_Token_Status ∈ {used, booked}`, or
     `Status 3 (Final Interview)` / `Final_Status` already
     scheduled/booked/completed/passed/rejected);
   - **reject-ready**: decision `reject` and `Voice_Rejection_Email_Sent ∈ {'',
     pending, error}`;
   - **approve-ready**: decision `approve` and either
     `Voice_Approval_Processed ∈ {'', pending, error}`, or it is `processing`
     but a `Final_Interview_Booking_Link` exists, the email isn't `yes`, and
     the token is not expired (recoverable mid-flight retry);
   - additionally requires the voice result to be genuinely completed **or** an
     explicit manual override (`Voice_HR_Comments` contains "manual") **or** HR
     has explicitly decided;
   - de-dupes by `Application ID`.
4. `splitInBatches` → **Route Voice HR Decision** (reject vs approve).
5. **Reject branch**: validate email → `Voice_Rejection_Email_Sent = Sending`
   → re-read → confirm guard → **Send Voice Interview Rejection** (Gmail
   account 4, plain rejection copy, no AI notice) → on success `Final_Status =
   Rejected After Voice Interview`, `Status 2 (Voice Interview) = Rejected`,
   `Voice_Rejection_Email_Sent = Yes`. Failure → `Error` + `Voice_Result_Error`.
6. **Approve branch**: `Voice_Approval_Processed = Processing` → re-read →
   **Confirm Voice Approval Processing** (also re-checks "no completed final
   booking") → **Generate Final Interview Token**: despite the name it does
   **not** mint a token — it *validates the portal-generated*
   `Final_Interview_Booking_Link` (must be an `https` URL) and
   `Final_Interview_Booking_Token_Expires_At` (present, parseable, future),
   throwing otherwise. → **Mark Approval Link Processing** (keeps
   `Voice_Approval_Processed = Processing`) → **Prepare Final Interview
   Invitation** (re-validates link + expiry) → **Send Final Interview Booking
   Email** (Gmail account 4; subject "Next Step: Schedule Your Final Interview
   with McLink Group"; styled "Schedule Final Interview" button pointing at the
   portal link; "expires in 7 days"; **no AI notice** — this is the human HOD
   interview).
7. Success → **Mark Approved for Final Interview**: `Voice_Approval_Processed =
   Yes`, `Final_Interview_Email_Sent = Yes`, clears `Voice_Result_Error`.
   Failure → `Voice_Approval_Processed = Error` + `Voice_Result_Error`.

> Orphaned in the canvas: a `Hash Final Interview Booking Token` crypto node
> exists but is not connected to anything — a leftover from when this workflow
> minted its own token instead of consuming the portal's.

---

## 7. Final Interview Booking API v2 — Availability and Reserve — `6rxRBMgtQ4odrb1m`

**Triggers**: two webhooks (no auth; CORS origin
`https://ellai.mclinkgroup.com`, methods `GET, POST, OPTIONS`,
`Cache-Control: no-store`). 26 nodes. Active. Serves the candidate
`/book/final/<token>` page.

- `GET  /webhook/recruitment/final-interview/availability?token=<raw>`
- `POST /webhook/recruitment/final-interview/reserve` — body `{ token,
  slot_id, timezone }` (also accepts `slotId`; timezone defaults
  `Asia/Manila`)

### Availability path
1. **Prepare Final Availability Request**: `DEMO_MODE` gate; token regex
   `^[A-Za-z0-9_-]{24,256}$`.
2. `crypto` SHA-256 (`token_hash`) → read `High_Match_Profile` → **Validate
   Final Availability**: match row on `Final_Interview_Booking_Token_Hash`
   (lower-cased); reject `Is_UAT`; require application id + candidate name +
   `Role_ID`, token not expired, `Voice_HR_Decision = approve`,
   `Voice_Approval_Processed = yes`, `Final_Status ∈ {approved for final
   interview, final interview booking link sent}`, and `Status 3 (Final
   Interview) = awaiting schedule`.
3. Read `Interview_Slots` → **Build Final Availability**: keep `Interview_Type
   = "Final Interview"`, `Status = Available`, role match, timezone in
   {`Asia/Manila`, `Asia/Singapore`}, future start. Returns
   `{ success, code, applicant:{application_id, first_name, full_name, role,
   role_id}, slots:[…] }`; empty → `no_slots`.

### Reserve path
1. **Prepare Final Reservation Request**: `DEMO_MODE` gate; token regex,
   `slot_id` non-empty, timezone in the two allowed zones.
2. Hash → read `High_Match_Profile` → **Validate Final Reservation** (same
   rule set as availability).
3. Read `Interview_Slots` → **Prepare Final Reservation**: re-check the slot is
   `Available` + `Final Interview` + role; mint
   `reservation_token = FINAL-<ms>-<rand>`, `reserved_at`,
   `reservation_expires_at` = +5 min. Missing/unavailable → `slot_unavailable`.
4. **Mark Final Slot Reserved** (`Status = Reserved` + token, plus
   `Application_ID`/name/email) → **Finalize Final Slot Booked** (`Status =
   Booked`, `Booked_At`, clears reservation token). **Unlike the voice booking
   API this path has no re-read/confirm step between Reserved and Booked** — it
   trusts the write.
5. **Update High Match Final Booking** (`High_Match_Profile`): `Status 3 (Final
   Interview) = Interview Scheduled`, `Final_Status = Final Interview
   Scheduled`, `Final_Interview_Booking_Status = Booked`, scheduled
   date/time/timezone, `Final_Interview_Booking_Token_Status = Used`.
6. **Send Final Confirmation Email** (Gmail account 4) — **`disabled`**. The
   next node still marks `success: true` with `email_delivery_delayed` from
   whether the (skipped) send "failed". Response:
   `{ success, email_delivery_delayed }`.
7. Errors → **Return Final Booking Error** `{ success:false, code }`
   (`invalid_token` / `invalid_request` / `invalid_or_expired_token` /
   `uat_guard` / `slot_unavailable` / `booking_failed`).

This workflow does **not** create any calendar event or `Voice_Call_Queue`-style
record; the HR interview calendar handling described in
`WORKING-RECRUITMENT-WORKFLOW.md` §"HR decision and HR interview" is done by
`4FsKYuSxyaKxFtsM` / the connected shared HR Google Calendar, not here.

---

## Cross-workflow notes worth revisiting

- **Two disabled confirmation-email nodes** (workflows 3 and 7). Voice booking
  confirmation is covered by `If1HFQmMY9AeFUiz`; the **final** interview
  booking currently sends **no confirmation email at all** unless that node is
  re-enabled or another workflow covers it.
- **`Voice_Call_Max_Attempts` mismatch**: written as `1` by workflow 3, but
  workflows 4/5 treat a missing value as `3`. Redials are effectively capped at
  1 as long as the queue row keeps the literal `1`.
- **Expired voice-call locks** are not auto-recovered by workflow 4 (it only
  writes an error asking for a manual reset to `Retry`), even though the filter
  code is written to pick `lock_expired` rows up.
- Webhook APIs (3, 7) trust `X-Webhook-Secret`-less requests and rely on the
  hashed booking token as the only credential; CORS is pinned to
  `https://ellai.mclinkgroup.com` while invitation emails (workflow 2) link to
  `https://ella-recruitment.mclinkgroup.com`.
