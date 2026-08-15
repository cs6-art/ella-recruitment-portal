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
    "aiSystemPrompt": "Editable template containing {{system_prompt}}",
    "resolvedAiSystemPrompt": "Rendered prompt for the current role",
    "initialInterviewBookingLink": "https://...",
    "hodInterviewBookingLink": "https://...",
    "postingChannels": "LinkedIn, careers page",
    "voiceInterviewAvailabilityMode": "automatic",
    "voiceInterviewSlots": [],
    "voiceInterviewAutoStartDate": "2026-08-17",
    "voiceInterviewAutoEndDate": "2026-08-28",
    "voiceInterviewTimezone": "Asia/Singapore",
    "evaluationFieldToggles": ["technical_depth"],
    "customEvaluationFields": [
      { "key": "domain_fluency", "label": "Domain fluency", "description": "Assess fluency in the required domain." }
    ]
  },
  "Job_Description": "...",
  "Screening_Criteria": "...",
  "Initial_Interview_Questions": "...",
  "AI_System_Prompt": "...",
  "VAPI_Resolved_System_Prompt": "...",
  "Initial_Interview_Booking_Link": "https://...",
  "HOD_Interview_Booking_Link": "https://...",
  "Posting_Channels": "LinkedIn, careers page",
  "Evaluation_Fields": "[{\"key\":\"score\",\"label\":\"Score\",\"description\":\"Overall numeric fit score for the role.\"}]",
  "Recruitment_Setup_Updated_At": "2026-07-25T00:00:00.000Z",
  "Recruitment_Setup_Updated_By_Name": "HR User",
  "Recruitment_Setup_Updated_By_Email": "hr@mclinkgroup.com",
  "License_or_Certificate_Required": "",
  "Keywords_to_Look_For": "",
  "Minimum_Years_of_Experience": "None",
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
`expectedCurrentStatus`, persist the editable `AI_System_Prompt` template and
the structured criteria values, and use `VAPI_Resolved_System_Prompt` (or
render the template itself) when configuring Vapi. The `{{system_prompt}}`
placeholder must be replaced with the structured HR criteria at call setup;
the editable template must remain available for later HR changes. Return HTTP
200 JSON with `{ "success": true }`.

For candidate final-interview invitations, the portal creates or normalizes
`Final_Interview_Booking_Link` when HR approves the voice interview. n8n
should send that exact sheet value in the invitation email; it should not
replace the host with a hard-coded `ellaimclinkgroup.com` or `localhost`.
The portal uses `NEXT_PUBLIC_APP_URL` when configured, otherwise the forwarded
request host, so local development produces `http://localhost:3000/book/final/...`.
After the candidate books a slot, the portal sets
`Final_Interview_Booking_Token_Status` to `Used`, and the same token must not
be accepted again.

## Events and responses

Role-request payloads include `role.hodEmail` and
`role.hodAvailabilitySlots`. The workflow should map these to
`HOD_Email` and `HOD_Availability_Slots`; the portal also sends the legacy
human-readable `HOD_Availability_Dates` and `HOD_Availability_Times` fields.
`HOD_Availability_Slots` is a JSON array of `{ date, startTime, endTime,
timezone }` objects and is used by the portal when validating final interview
slots.

Recruitment setup payloads also include the optional HR-owned voice availability
configuration. The workflow should preserve `voiceInterviewAvailabilityMode`,
`voiceInterviewSlots`, `voiceInterviewAutoStartDate`,
`voiceInterviewAutoEndDate`, and `voiceInterviewTimezone` in the role row.
Publishing the role creates the configured AI Voice Interview slots in the
portal's `Interview_Slots` tab; the existing booking workflow then uses them.

The portal also supports `interviewAvailabilityRules`, persisted in the
`Interview_Availability_Rules` Role_Requests column. Treat this as the
preferred source for new schedules: recurring rules and specific slots are
expanded virtually by the portal. n8n should preserve the field when reading
or updating a role and should not recreate virtual availability as duplicate
`Interview_Slots` rows. Existing booked and legacy rows remain compatible.

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
  "jobTitle": "Sales Manager",
  "department": "Commercial",
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
  "resumeFile": {
    "fileId": "RES-...",
    "fileName": "candidate-resume.pdf",
    "mimeType": "application/pdf",
    "size": 123456,
    "sha256": "...",
    "uploadedAt": "2026-08-11T00:00:00.000Z",
    "expiresAt": "2026-09-10T00:00:00.000Z",
    "kind": "pdf"
  },
  "submittedAt": "2026-08-07T00:00:00.000Z",
  "source": "Public Application Page",
  "applicationSource": "Direct Application"
}
```

The portal presents one contact-number control to HR and candidates: a country
code plus a local number. It sends the normalized international number through
the legacy `phone` and `preferredMobile` aliases so existing voice-booking
workflows continue to work. n8n should write the same value to the candidate
sheet's contact-number fields. The selected role is carried in `jobTitle` and
`department` so CV analysis can populate `Selected_Role` and `Department` in
`High_Match_Profile`; the portal reads those fields when rendering applicants.

The HR intake route uses the same schema, but the `source` value is
`HR Manual Intake` and `consent` is omitted. The allowed `applicationSource`
values are `Direct Application`, `Referral`, `Walk-in`, `Agency`,
`Existing Database`, and `HR Invitation`.

The portal accepts either pasted resume text or one validated PDF/DOCX file.
For a file submission, the portal validates the extension, MIME type, file
signature, 10 MB limit, and readable extracted text, stores the binary in the
private resume storage directory, and sends only extracted text plus safe file
metadata to n8n. The active `McLink - Candidate Application Foundation`
workflow validates the selected `Role_ID` and file metadata, loads that role's
job description and screening criteria, runs role-specific AI screening, and
appends the result with `Recommendation: For HR Review`,
`Resume_HR_Decision: Pending`, and safe `Resume_File_*` metadata. The AI is
not allowed to approve or reject a candidate. HR decisions remain portal-owned
and are written to candidate status history. Binary or base64 resume content is
never sent to or stored in Google Sheets.

## Bulk Resume Screening

The Resume Screening page can direct HR to a shared Google Drive folder for
bulk intake. Upload PDF or DOCX files using a role-prefixed filename such as
`AC01 - Candidate Name.pdf`. The n8n poller searches that folder every five
minutes, claims one file at a time, extracts its text through the portal, and
submits the same candidate-application contract used by the existing screening
workflow.

Create a `Bulk_Resume_Queue` tab in the candidate workbook with this header
row, in this order:

`driveFileId, driveFileName, driveFileUrl, driveFileMimeType, roleId,
candidateName, candidateEmail, preferredMobile, applicantCountry, status,
applicationId, errorMessage, discoveredAt, processingStartedAt, processedAt,
attemptCount, lastUpdated`

The queue uses `Queued`, `Processing`, `Screened`, `Failed`, and `Skipped`
statuses. The portal groups events by `driveFileId` and displays only the latest
timestamped status. `Screened` is terminal for the selected role: uploading the
same resume again returns a `Skipped` result and does not call the AI screening
workflow or create another queue item.
The queue identity is role-scoped for portal uploads, so the same resume may be
screened independently for a different published role. A failed file remains
visible as `Failed` and is not automatically retried by the Drive poller;
correct the source file or queue entry before retrying it.

Configure the n8n environment with `GOOGLE_BULK_RESUME_DRIVE_FOLDER_ID` and
`N8N_BULK_RESUME_PORTAL_BASE_URL`. The latter must be a URL reachable from n8n
(a local `http://localhost:3000` URL will not work from a hosted n8n instance).

For local HR testing, the primary flow is the portal's direct multi-file upload.
The portal extracts each PDF/DOCX locally and sends one JSON request at a time
to `N8N_BULK_RESUME_UPLOAD_WEBHOOK_URL` at `/webhook/bulk-resume-upload`.
The `McLink - Bulk Resume Upload Intake` workflow extracts candidate contact
details, writes the processing claim, calls the existing candidate screening
workflow, and records the final queue status. It uses the SHA-256 file hash as
the queue ID, so uploading the same file again does not create another
screening request after it is marked `Screened`.

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
