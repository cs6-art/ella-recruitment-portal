# n8n payload contracts

## Recruitment setup update

The portal sends this payload to `N8N_RECRUITMENT_SETUP_WEBHOOK_URL`, or to
`N8N_ROLE_WEBHOOK_URL` when the dedicated URL is not set:

```json
{
  "eventType": "recruitment_setup_updated",
  "roleId": "ROLE-...",
  "actionRequestId": "uuid",
  "expectedCurrentStatus": "Approved",
  "recruitmentSetup": {
    "jobDescription": "...",
    "screeningCriteria": "...",
    "initialInterviewQuestions": "...",
    "aiSystemPrompt": "...",
    "initialInterviewBookingLink": "https://...",
    "hodInterviewBookingLink": "https://...",
    "postingChannels": "LinkedIn, careers page"
  },
  "Job_Description": "...",
  "Screening_Criteria": "...",
  "Initial_Interview_Questions": "...",
  "AI_System_Prompt": "...",
  "Initial_Interview_Booking_Link": "https://...",
  "HOD_Interview_Booking_Link": "https://...",
  "Posting_Channels": "LinkedIn, careers page",
  "Recruitment_Setup_Updated_At": "2026-07-25T00:00:00.000Z",
  "Recruitment_Setup_Updated_By_Name": "HR User",
  "Recruitment_Setup_Updated_By_Email": "hr@mclinkgroup.com",
  "License_or_Certificate_Required": "",
  "Keywords_to_Look_For": "",
  "Minimum_Years_of_Experience": 2,
  "Transferable_Skills_Accepted": "",
  "Salary_or_Budget_Range": "",
  "Earliest_Availability_Rule": "",
  "Interview_Behavior": "",
  "performedByName": "HR User",
  "performedByEmail": "hr@mclinkgroup.com",
  "performedByAccessRole": "HR",
  "performedByDepartment": "People",
  "comments": "Setup completed",
  "portalUrl": "https://recruitment.example.com/roles/ROLE-...",
  "timestamp": "2026-07-25T00:00:00.000Z"
}
```

n8n must verify `X-Webhook-Secret`, verify the role is still in
`expectedCurrentStatus`, update the seven setup columns plus the three audit
columns, and return HTTP 200 JSON with `{ "success": true }`.

## Events and responses

The existing role-request webhook accepts `role_request_created`,
`role_status_transition`, and `recruitment_setup_updated`. Every write carries
an `actionRequestId`; n8n must treat it as an idempotency key and return JSON
with `success`, `roleId`, `status`, `action`, `actionRequestId`,
`notificationStatus`, `notificationError`, and optional `idempotentReplay`.
`notificationStatus` is `sent`, `pending`, `failed`, or `not_configured`.
Notification failure must not change `success` to false after the sheet update.

## Candidate application submission

The portal sends this payload to `N8N_CANDIDATE_APPLICATION_WEBHOOK_URL` with
the same `X-Webhook-Secret` and `X-Idempotency-Key` pattern used by the public
application route and the HR manual intake route:

```json
{
  "eventType": "candidate_application_submitted",
  "applicationId": "APP-...",
  "roleId": "ROLE-...",
  "Role_ID": "ROLE-...",
  "candidate": {
    "name": "Candidate Name",
    "email": "candidate@example.com",
    "phone": "+639000000000",
    "preferredMobile": "+639171234567",
    "resumeText": "Extracted resume text only",
    "salaryExpectation": "PHP 50,000",
    "noticePeriod": "30 days",
    "availability": "Immediate",
    "skillsAssessment": "Strong communication",
    "roleExpectations": "Clear ownership",
    "applicationSource": "Direct Application",
    "consent": true
  },
  "submittedAt": "2026-08-07T00:00:00.000Z",
  "source": "Public Application Page",
  "applicationSource": "Direct Application"
}
```

The HR intake route uses the same schema, but the `source` value is
`HR Manual Intake` and `consent` is omitted. The allowed `applicationSource`
values are `Direct Application`, `Referral`, `Walk-in`, `Agency`,
`Existing Database`, and `HR Invitation`.

Actual PDF/DOCX uploads are deferred. Do not store binary or base64 resume
content in Google Sheets. Store file metadata separately and keep only the
extracted text in `High_Match_Profile`.

## Recruitment Setup stage actions

The portal keeps the event name `recruitment_setup_updated` and adds a
`setupAction` field so existing webhook routing remains compatible. Supported
actions are `save_draft`, `mark_recruitment_ready`,
`mark_ready_for_publishing`, and `publish_role`. n8n must write the supplied
`Recruitment_Setup_Status` and stage audit columns. Only `publish_role` may
write `Status: Job Posted`, `Posted_At`, and `Posted_By`; a normal draft save
must not publish or trigger posting notifications.

The server rejects stage actions before sending them when required fields are
missing and returns `RECRUITMENT_SETUP_INCOMPLETE` with `missingFields`.

## Status notifications

The existing `role_status_transition` payload continues to be the source of
truth for status updates. After Google Sheets writes, n8n should resolve
recipients from `User_Directory` and `Requester_Email`, send the email, and
return `notificationStatus` as `sent`, `pending`, `failed`, or
`not_configured`. The email link must use the payload's `portalUrl`.
