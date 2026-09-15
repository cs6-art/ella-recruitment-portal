# n8n workflow folder organization

Plan: sort every recruitment workflow into one of three folders under `HR/`.
Tags were applied via the n8n MCP API to make the bulk move fast — in the n8n
workflow list, filter by tag, select all, **Move to folder**.

Folder targets (all already exist except `HR/Legacy`):

| Tag | Target folder | Count |
|-----|---------------|-------|
| `recruitment-prod` | `HR / Recruitment Portal` | 20 |
| `recruitment-pilot` | `HR / Pilot` | 9 |
| `recruitment-legacy` | `HR / Legacy` (create it) | 15 |
| `recruitment-review` | leave in place — trace usage first, then prod or legacy | 4 |

## Tag status

Tags were applied through the MCP API. **10 legacy workflows could not be
tagged** because they have "Available in MCP" turned off — tag/move those by
hand in the UI (they're all inactive, so low risk).

### recruitment-prod → `HR / Recruitment Portal` (tagged ✓)

- McLink - Candidate Application Foundation — `Ov0Fkg0xBPUmcpN9`
- AI Recruitment HR Approval Notifications — `3sv4S9Zb1DUzJbzR`
- AI Role Description Parser — `eo6jK6OzrI5CHvAE`
- AI Voice Interview Booking Confirmation — `If1HFQmMY9AeFUiz`
- AI Voice Interview Booking Invitations — `yKb9DvRNahvGAcRO`
- AI Voice Interview Scheduled Calling — `A6M0lIp5YARQ1VDJ`
- Bulk Resume Screening Worker — `4EcA0wMYVvPtpMVM`
- Bulk Resume Upload Intake — `HKgOqpFYJHSTH5Te`
- Final Interview Booking API v2 - Availability and Reserve — `6rxRBMgtQ4odrb1m`
- JD Role Folder Bulk Resume Screening — `MWt7W7LNFNZxcc0q`
- McLink - Application Invite Email — `JQPQvZyzbyyMI1FD`
- Phase 5 - Scheduled Vapi Result Polling — `IsGpeZUaeNN1VLC3`
- Publish Role to Portal Sheets — `1BxD9VwXMvX98cHh`
- Recruitment - Recruitment Setup Writer — `hPT4Lsm51q75GqUg`
- Recruitment - Role Request Wiring Fixed — `xA18TCuwmbWYZiDf`
- Recruitment Booking API — `4vCXB8O9rmwVX5To`
- Recruitment Booking Reservation Cleanup — `Ds2gYCpeJJCM5H6r`
- Voice Interview HR Decision v2 - Hashed Final Booking Token — `4FsKYuSxyaKxFtsM`
- Voice Result Status Sync — `JKv9cdP7ihejhl9D`
- AI Final Interview Booking Confirmation — `3r54MAgEv4UMRLqL`

### recruitment-pilot → `HR / Pilot` (tagged ✓)

- AI Final Interview Booking Confirmation (Pilot) — `SQgv92WepQCNmAgx`
- AI Voice Interview Booking Confirmation (Pilot) — `NN8r5PPUktrPkVIr`
- AI Voice Interview Scheduled Calling (Pilot) — `cTJHm2ZAJQap7uWW`
- McLink - Candidate Application Foundation (Pilot) — `K1JdkJH4NKEcB78E`
- McLink - Role Request Status (Pilot) — `EYJvn4dVWPDGUh5Q`
- McLink - Screening Complete Notifier (Pilot) — `OnQNFmdMzrZPnLT0`
- Phase 5 - Scheduled Vapi Result Polling (Pilot) — `M9HyAnRov4TcpFIQ`
- Voice Interview HR Decision v2 - Hashed Final Booking Token (Pilot) — `rsfQl6nkVWd7Zo3B`
- Voice Result Status Sync (Pilot) — `29HvXI7H4eKUJ1Uv`

### recruitment-legacy → `HR / Legacy`

Tagged ✓:
- ELLA - Production Calling Workflow - Email Final Interview — `9qz5CFe5qLXMvO2x`
- McLink - Bulk Resume Screening — `8iB5LY0FheMdrNEG`
- Role Folder Bulk Resume Screening — `7vvfJS8DaDPVfD95`
- McLink - Role Request Foundation — `kjtG2I2QgXVZPIAB`

Tag by hand (MCP access off):
- HR Assistant - Email Processor and Scheduler — `5IrzB1MnNpN1lT85`
- HR Assistant - Email Processor and Scheduler (dup) — `GeUE8swpQqwmGWSL`
- HR Assistant - Email Sender — `krtr0lvTfUvgJ7iu`
- HR Assistant - JD Cache — `YyelyESAyq6ju8bC`
- HR Assistant - VAPI Voice Agent — `WoxvehS5TQisI4Bm`
- HR Assistant Interview Reminder — `mEUOFVFUxkvYRZur`
- HR Queue - Gmail and Forms Intake — `VNfNMjq9fXneitOA`
- HR Queue - Resume AI Processor — `HTpp0sMoZByWWbt1`
- HR Resume Screener Test — `d23RMaSaIlmfCYUA`
- Resume AI Processor — `9yvdA3uJl0ZZJSDa`
- ELLA - Production Email Scheduling and Final Booking - FIXED — `X4KQ5naOMf9kSWew`
  (tagged ✓ — it was MCP-accessible)

### recruitment-review — trace before filing (tagged ✓)

Still active; each looks like an earlier iteration of a live prod workflow.
Confirm nothing calls them, then move to `HR/Legacy` (or keep in prod if used).

- AI Recruitment Application Workflow — `9k5nGuC1CHQBdVHx`
  (overlaps McLink - Candidate Application Foundation)
- Phase 1 - Applicant Screening (Portal Backed) — `cmOBqy5wrtCuF1U6`
  (same overlap, older)
- Ella Application Status API — `LX8B1ZQBImmDjx9t` (unclear consumer)
- AI Voice Interview HR Decision Monitor — `hlDvcnmr2JubxyUW`
  (email sending hardcoded off; likely superseded by HR Decision v2)

## Note on the "6 Step Demo" phase folders

`HR / Demo / 6 Step Demo / Phase 1–6` is a separate demo structure and was left
untouched.
