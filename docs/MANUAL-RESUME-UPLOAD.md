# Resume upload scope

The portal now accepts one PDF or DOCX file, while retaining pasted text as a
fallback during rollout. PDF and DOCX bytes are never placed in
`High_Match_Profile` or sent as a large base64 JSON field.

1. `CandidateApplicationForm.tsx` accepts one PDF or DOCX file and validates
   the extension and a 10 MB maximum.
2. `/api/uploads/resumes` validates the file signature, extracts readable text
   with server-side PDF/DOCX parsers, and stores the binary under a generated
   private object key in `RESUME_STORAGE_DIR`.
3. The application webhook carries `resumeFile` metadata alongside the
   extracted `resumeText`. n8n validates the metadata and screens the extracted
   text; no binary data crosses the webhook.
4. `High_Match_Profile` stores extracted text and non-sensitive file metadata,
   never file bytes or permanent public URLs.
5. `/api/uploads/resumes/[fileId]` allows only authorized HR sessions to
   download a non-expired file. Expiry is 30 days by default.

Before production enablement, configure `RESUME_STORAGE_DIR` as a private,
persistent directory, add malware scanning at the hosting edge or storage
layer, and verify retention cleanup. The current route rejects invalid file
signatures and empty extraction results before screening.
