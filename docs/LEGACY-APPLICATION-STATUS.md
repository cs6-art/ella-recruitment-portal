# Legacy application-status experience

The public resume page currently ends at the submission receipt. It does not
poll application status or display voice-interview and final-interview stages.
This document preserves the previous status experience for a future release.

## Legacy endpoint

`GET https://n8n.srv1457709.hstgr.cloud/webhook/ella-application-status?application_id=APP-...`

The legacy n8n workflow is **Ella Application Status API**
(`LX8B1ZQBImmDjx9t`). It reads the applicant row from the candidate sheet and
returns JSON shaped like:

```json
{
  "success": true,
  "application_id": "APP-...",
  "stage": "resume_received",
  "step": 1,
  "title": "Resume received",
  "message": "Your resume was submitted successfully.",
  "resume_status": "Processing",
  "voice_status": "Pending",
  "final_status": "Pending",
  "stop_polling": false,
  "updated_at": "2026-08-17T00:00:00.000Z"
}
```

The former browser client polled every five seconds, used `stage` and the
three status fields to update a four-step timeline, and stopped when
`stop_polling` was `true` or a terminal stage was reached.

## Legacy stage map

| Stage | Step | Meaning |
| --- | ---: | --- |
| `resume_received` | 1 | Resume received |
| `screening` | 2 | Resume screening in progress |
| `preparing_call` / `awaiting_schedule` | 3 | Voice interview preparation or scheduling |
| `scheduled` / `calling` / `interviewing` | 3 | Voice interview activity |
| `completed` / `interviewed` / `callback` / `manual_review` | 3 | Voice interview outcome or review |
| `final_interview` / `final_interview_scheduled` / `final_interview_reschedule` | 4 | Final interview stage |
| `rejected` | 2 or 4 | Application will not proceed |
| `not_found` | 0 | Record is not visible yet; continue polling |

## Re-enable checklist

1. Restore the status timeline and status detail rows in the receipt card.
2. Require a valid `application_id` in the submission response before starting
   polling.
3. Call the status endpoint with a cache-busting query parameter.
4. Render only the stage values supported by the current status workflow.
5. Confirm terminal-stage behavior and empty-sheet responses before enabling it
   for candidates.

The current UX deliberately keeps this contract out of the active submission
flow so candidates receive a stable confirmation while HR communications
remain email-led.
