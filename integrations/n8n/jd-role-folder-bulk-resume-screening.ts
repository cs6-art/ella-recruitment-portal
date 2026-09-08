// Deployable n8n workflow definition for month-folder Drive intake. It keeps
// role mapping, bounded retries, queue idempotency, and sequential screening
// behavior in one auditable integration artifact.
import {
  workflow,
  node,
  trigger,
  newCredential,
  ifElse,
  splitInBatches,
  nextBatch,
  expr,
} from '@n8n/workflow-sdk';

const candidateWorkbook = '1J6qadoB07aliQWtV8uykEYW7ENjNOf0nsZ_iTt9g8KM';
const sheetsCredentials = { googleApi: newCredential('Google Sheets Service Account') };
const driveCredentials = { googleApi: newCredential('Google Drive Service Account') };

const queueSchema = [
  'driveFileId', 'driveFileName', 'driveFileUrl', 'driveFileMimeType', 'roleId',
  'candidateName', 'candidateEmail', 'preferredMobile', 'applicantCountry', 'status',
  'applicationId', 'errorMessage', 'discoveredAt', 'processingStartedAt', 'processedAt',
  'attemptCount', 'lastUpdated', 'environment', 'is_uat', 'batchId', 'jobId',
].map((id) => ({ id, displayName: id, type: id === 'is_uat' ? 'boolean' : 'string', canBeUsedToMatch: id === 'jobId' }));

const queueAppendParameters = {
  resource: 'sheet',
  operation: 'appendOrUpdate',
  authentication: 'serviceAccount',
  documentId: { __rl: true, mode: 'id', value: candidateWorkbook },
  sheetName: { __rl: true, mode: 'name', value: 'Bulk_Resume_Queue' },
  columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['jobId'], schema: queueSchema },
  options: {
    cellFormat: 'USER_ENTERED',
    handlingExtraData: 'ignoreIt',
    locationDefine: { values: { headerRow: 1 } },
  },
};

const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Bulk Resume Poller - Every 10 Minutes',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } },
    position: [240, 300],
  },
  output: [{}],
});

const readMap = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Role Folder Map',
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: candidateWorkbook },
      sheetName: { __rl: true, mode: 'name', value: 'Bulk_Role_Folder_Map' },
      returnAllMatches: 'returnAllMatches',
      options: {
        dataLocationOnSheet: {
          values: { rangeDefinition: 'detectAutomatically', readRowsUntil: 'lastRowInSheet' },
        },
      },
    },
    credentials: sheetsCredentials,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [520, 300],
  },
  output: [{ Role_ID: 'GM01', Role_Name: 'General Manager', Drive_Folder_ID: 'folder-id', Active: 'TRUE' }],
});

const activeMap = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Keep Active Role Folders',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const text = (value) => String(value ?? '').trim();
return $input.all()
  .map((item) => item.json)
  .filter((row) => ['true', 'yes', '1', 'active'].includes(text(row.Active).toLowerCase()))
  .filter((row) => text(row.Role_ID) && text(row.Drive_Folder_ID))
  .map((row) => ({ json: {
    roleId: text(row.Role_ID),
    roleName: text(row.Role_Name),
    roleFolderId: text(row.Drive_Folder_ID),
  } }));`,
    },
    position: [800, 300],
  },
  output: [{ roleId: 'GM01', roleName: 'General Manager', roleFolderId: 'folder-id' }],
});

const searchMonthFolders = node({
  type: 'n8n-nodes-base.googleDrive',
  version: 3,
  config: {
    name: 'Find Month and Year Folders',
    parameters: {
      authentication: 'serviceAccount',
      resource: 'fileFolder',
      operation: 'search',
      searchMethod: 'query',
      queryString: 'trashed = false',
      returnAll: true,
      filter: {
        folderId: { __rl: true, mode: 'id', value: expr('{{ $json.roleFolderId }}') },
        whatToSearch: 'folders',
        includeTrashed: false,
      },
      options: { fields: ['id', 'name', 'mimeType', 'webViewLink'] },
    },
    credentials: driveCredentials,
    alwaysOutputData: true,
    position: [1080, 300],
  },
  output: [{ id: 'month-folder-id', name: 'Dec 2025', mimeType: 'application/vnd.google-apps.folder' }],
});

const tagMonthFolders = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Month Folder',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const role = $('Keep Active Role Folders').item.json;
const name = String($json.name || '').trim();
const months = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
let month = 0;
let year = 0;
let match = name.toLowerCase().match(/^([a-z]+)[\\s_-]+(20\\d{2})$/);
if (match && months[match[1]]) {
  month = months[match[1]];
  year = Number(match[2]);
} else {
  match = name.match(/^(20\\d{2})[\\s_-]+(0?[1-9]|1[0-2])$/);
  if (match) { year = Number(match[1]); month = Number(match[2]); }
  if (!match) {
    match = name.match(/^(0?[1-9]|1[0-2])[\\s_-]+(20\\d{2})$/);
    if (match) { month = Number(match[1]); year = Number(match[2]); }
  }
}
return { json: {
  roleId: role.roleId,
  roleName: role.roleName,
  roleFolderId: role.roleFolderId,
  monthFolderId: String($json.id || ''),
  monthFolderName: name,
  month,
  year,
  validMonthFolder: Boolean($json.id && month && year),
} };`,
    },
    position: [1360, 300],
  },
  output: [{ roleId: 'GM01', monthFolderId: 'month-folder-id', monthFolderName: 'Dec 2025', month: 12, year: 2025, validMonthFolder: true }],
});

const validMonthFolders = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Keep Valid Month Folders',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `return $input.all().filter((item) => item.json.validMonthFolder);`,
    },
    position: [1640, 300],
  },
  output: [{ roleId: 'GM01', monthFolderId: 'month-folder-id', month: 12, year: 2025 }],
});

const searchResumes = node({
  type: 'n8n-nodes-base.googleDrive',
  version: 3,
  config: {
    name: 'Find Resumes in Month Folder',
    parameters: {
      authentication: 'serviceAccount',
      resource: 'fileFolder',
      operation: 'search',
      searchMethod: 'query',
      queryString: 'trashed = false',
      returnAll: true,
      filter: {
        folderId: { __rl: true, mode: 'id', value: expr('{{ $json.monthFolderId }}') },
        whatToSearch: 'files',
        includeTrashed: false,
      },
      options: { fields: ['id', 'name', 'mimeType', 'webViewLink'] },
    },
    credentials: driveCredentials,
    alwaysOutputData: true,
    position: [1920, 300],
  },
  output: [{ id: 'resume-file-id', name: 'Candidate.pdf', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/file/d/resume-file-id/view' }],
});

const tagResumes = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Tag Resume with Folder Context',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const folder = $('Keep Valid Month Folders').item.json;
return { json: {
  id: String($json.id || ''),
  name: String($json.name || ''),
  mimeType: String($json.mimeType || ''),
  webViewLink: String($json.webViewLink || ''),
  roleId: folder.roleId,
  roleName: folder.roleName,
  monthFolderId: folder.monthFolderId,
  monthFolderName: folder.monthFolderName,
  month: folder.month,
  year: folder.year,
} };`,
    },
    position: [2200, 300],
  },
  output: [{ id: 'resume-file-id', name: 'Candidate.pdf', roleId: 'GM01', month: 12, year: 2025 }],
});

const readQueue = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Bulk Resume Queue',
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: candidateWorkbook },
      sheetName: { __rl: true, mode: 'name', value: 'Bulk_Resume_Queue' },
      returnAllMatches: 'returnAllMatches',
      options: {
        dataLocationOnSheet: {
          values: { rangeDefinition: 'detectAutomatically', readRowsUntil: 'lastRowInSheet' },
        },
      },
    },
    credentials: sheetsCredentials,
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [2480, 300],
  },
  output: [{ driveFileId: 'old-file', roleId: 'GM01', status: 'Screened' }],
});

const readApplicants = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Read Existing Screened Applicants',
    parameters: {
      resource: 'sheet',
      operation: 'read',
      authentication: 'serviceAccount',
      documentId: { __rl: true, mode: 'id', value: candidateWorkbook },
      sheetName: { __rl: true, mode: 'name', value: 'High_Match_Profile' },
      returnAllMatches: 'returnAllMatches',
      options: {
        dataLocationOnSheet: {
          values: { rangeDefinition: 'detectAutomatically', readRowsUntil: 'lastRowInSheet' },
        },
      },
    },
    credentials: sheetsCredentials,
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [2760, 300],
  },
  output: [{ 'Application ID': 'APP-BULK-old-file' }],
});

const selectDue = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Select Up to 20 Due Resumes',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const text = (value) => String(value ?? '').trim();
const files = $('Tag Resume with Folder Context').all().map((item) => item.json);
const queueRows = $('Read Bulk Resume Queue').all().map((item) => item.json);
const applicantRows = $('Read Existing Screened Applicants').all().map((item) => item.json);
const nowMs = Date.now();
const terminalApplications = new Set(applicantRows.map((row) => text(row['Application ID'] || row.Application_ID || row.applicationId)).filter(Boolean));
const eventTime = (row) => Date.parse(text(row.Last_Updated || row.lastUpdated || row.Processed_At || row.processedAt || row.Processing_Started_At || row.processingStartedAt || row.Discovered_At || row.discoveredAt)) || 0;
const latest = new Map();
for (const row of queueRows) {
  const id = text(row.Drive_File_ID || row.driveFileId);
  const roleId = text(row.Role_ID || row.roleId);
  if (!id) continue;
  const key = roleId.toLowerCase() + '|' + id;
  const time = eventTime(row);
  if (!latest.has(key) || time >= latest.get(key).time) latest.set(key, { row, time });
}
const hash = (value) => {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};
const pad = (value) => String(value).padStart(2, '0');
const due = [];
for (const file of files) {
  const id = text(file.id);
  const name = text(file.name);
  const mime = text(file.mimeType).toLowerCase();
  const roleId = text(file.roleId);
  const month = Number(file.month);
  const year = Number(file.year);
  if (!id || !name || !roleId || !month || !year) continue;
  if (!/\\.(pdf|doc|docx)$/i.test(name)) continue;
  if (!(mime.includes('pdf') || mime.includes('word') || mime === 'application/octet-stream')) continue;
  const applicationId = 'APP-BULK-' + id;
  if (terminalApplications.has(applicationId)) continue;
  const key = roleId.toLowerCase() + '|' + id;
  const previous = latest.get(key);
  const previousStatus = text(previous?.row?.Status || previous?.row?.status).toLowerCase();
  const previousAttempt = Number(previous?.row?.Attempt_Count || previous?.row?.attemptCount || 0) || 0;
  if (previousStatus === 'screened' || previousStatus === 'skipped' || previousAttempt >= 3) continue;
  const ageMs = previous ? nowMs - previous.time : Number.MAX_SAFE_INTEGER;
  if (previousStatus === 'processing' && ageMs < 30 * 60 * 1000) continue;
  const retryDelay = previousAttempt <= 1 ? 5 * 60 * 1000 : 15 * 60 * 1000;
  if (previousStatus === 'failed' && ageMs < retryDelay) continue;
  const seed = hash(id);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = (seed % daysInMonth) + 1;
  const hour = 8 + ((seed >>> 5) % 10);
  const minute = (seed >>> 11) % 60;
  const second = (seed >>> 17) % 60;
  const submittedAt = String(year) + '-' + pad(month) + '-' + pad(day) + 'T' + pad(hour) + ':' + pad(minute) + ':' + pad(second) + '+08:00';
  const fallback = name.replace(/\\.(pdf|doc|docx)$/i, '').replace(/[_-]+/g, ' ').replace(/\\b(resume|cv)\\b/gi, ' ').replace(/\\s+/g, ' ').trim();
  due.push({
    driveFileId: id,
    driveFileName: name,
    driveFileUrl: text(file.webViewLink),
    driveFileMimeType: mime || 'application/octet-stream',
    roleId,
    roleName: text(file.roleName),
    monthFolderName: text(file.monthFolderName),
    applicationId,
    submittedAt,
    fallbackCandidateName: fallback || ('Candidate ' + id.slice(-6)),
    status: 'Processing',
    discoveredAt: submittedAt,
    processingStartedAt: new Date().toISOString(),
    processedAt: '',
    errorMessage: '',
    attemptCount: String(previousAttempt + 1),
    lastUpdated: new Date().toISOString(),
    environment: 'production',
    is_uat: false,
    batchId: '',
    jobId: 'DRIVE-' + roleId + '-' + id,
  });
}
due.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.driveFileName.localeCompare(b.driveFileName));
return due.slice(0, 20).map((item) => ({ json: item }));`,
    },
    position: [3040, 300],
  },
  output: [{ driveFileId: 'resume-file-id', driveFileName: 'Candidate.pdf', driveFileMimeType: 'application/pdf', roleId: 'GM01', applicationId: 'APP-BULK-resume-file-id', submittedAt: '2025-12-03T09:15:00+08:00', attemptCount: '1' }],
});

const batch = splitInBatches({
  version: 3,
  config: { name: 'Process One Resume at a Time', parameters: { batchSize: 1, options: {} }, position: [3320, 300] },
});

const finish = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Batch Complete',
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `return [{ json: { success: true, message: 'This scheduled batch is complete.' } }];` },
    position: [3600, 100],
  },
  output: [{ success: true }],
});

const claim = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Claim Resume for Processing',
    parameters: queueAppendParameters,
    credentials: sheetsCredentials,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [3600, 300],
  },
  output: [{ driveFileId: 'resume-file-id', roleId: 'GM01', status: 'Processing' }],
});

const discoveryPause = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Pause Before Download',
    parameters: { resume: 'timeInterval', amount: 2, unit: 'seconds' },
    position: [3880, 300],
  },
  output: [{ driveFileId: 'resume-file-id' }],
});

const download = node({
  type: 'n8n-nodes-base.googleDrive',
  version: 3,
  config: {
    name: 'Download Drive Resume',
    parameters: {
      authentication: 'serviceAccount',
      resource: 'file',
      operation: 'download',
      fileId: { __rl: true, mode: 'id', value: expr('{{ $("Select Up to 20 Due Resumes").item.json.driveFileId }}') },
      options: { binaryPropertyName: 'data' },
    },
    credentials: driveCredentials,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 3000,
    position: [4160, 300],
  },
  output: [{ id: 'resume-file-id' }],
});

const extract = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Extract Resume Text',
    parameters: {
      method: 'POST',
      url: 'https://ella-recruitment.mclinkgroup.com/api/resume-screening/bulk/extract',
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'fileName', value: expr('{{ $("Select Up to 20 Due Resumes").item.json.driveFileName }}') },
        { name: 'driveFileId', value: expr('{{ $("Select Up to 20 Due Resumes").item.json.driveFileId }}') },
        { name: 'roleId', value: expr('{{ $("Select Up to 20 Due Resumes").item.json.roleId }}') },
      ] },
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'X-Webhook-Secret', value: '__WEBHOOK_SECRET__' },
        { name: 'Content-Type', value: expr('{{ $("Select Up to 20 Due Resumes").item.json.driveFileMimeType || "application/octet-stream" }}') },
      ] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: {
        timeout: 90000,
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
      },
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    onError: 'continueRegularOutput',
    position: [4440, 300],
  },
  output: [{ statusCode: 200, body: { text: 'Candidate resume text.' } }],
});

const checkExtraction = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Check Resume Extraction',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const base = $('Select Up to 20 Due Resumes').item.json;
const response = $json.body || $json;
const resumeText = String(response.text || response.resumeText || '').trim();
const statusCode = Number($json.statusCode || 0);
const error = $json.error?.message || response.error || response.message || '';
return { json: {
  ...base,
  resumeText,
  extractionReady: Boolean(statusCode >= 200 && statusCode < 300 && resumeText.length >= 20),
  stageError: resumeText.length < 20 ? String(error || 'Resume text is empty, unreadable, image-only, password-protected, or too short.') : String(error),
} };`,
    },
    position: [4720, 300],
  },
  output: [{ driveFileId: 'resume-file-id', extractionReady: true, resumeText: 'Candidate resume text.' }],
});

const extractionReady = ifElse({
  version: 2.3,
  config: {
    name: 'Resume Text Ready',
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 1 },
        conditions: [{ leftValue: expr('{{ $json.extractionReady }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
    position: [5000, 300],
  },
});

const normalizeContact = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Optional Candidate Contact',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const base = $('Check Resume Extraction').item.json;
const resumeText = String(base.resumeText || '');
const email = String(resumeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i)?.[0] || '').toLowerCase();
const phoneCandidates = resumeText.match(/(?:\\+?\\d[\\d\\s().-]{7,}\\d)/g) || [];
let mobile = '';
let country = '';
for (const candidate of phoneCandidates) {
  const raw = candidate.trim();
  const digits = raw.replace(/\\D/g, '');
  if (raw.startsWith('+') && /^[1-9]\\d{7,14}$/.test(digits)) mobile = '+' + digits;
  else if (digits.length === 12 && digits.startsWith('63')) mobile = '+' + digits;
  else if (digits.length === 11 && digits.startsWith('09')) mobile = '+63' + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith('9')) mobile = '+63' + digits;
  else if (digits.length === 10 && digits.startsWith('65')) mobile = '+' + digits;
  else if (digits.length === 8 && /^[3689]/.test(digits)) mobile = '+65' + digits;
  else if (digits.length >= 10 && digits.length <= 12 && digits.startsWith('60')) mobile = '+' + digits;
  if (mobile) break;
}
if (mobile.startsWith('+63')) country = 'PH';
else if (mobile.startsWith('+65')) country = 'SG';
else if (mobile.startsWith('+60')) country = 'MY';
const candidateName = String(base.fallbackCandidateName || '')
  .replace(/\\(\\d+\\)\\s*$/, '')
  .replace(/\\b(?:updated|new)\\b/gi, ' ')
  .replace(/\\b(?:19|20)\\d{2}\\b/g, ' ')
  .replace(/\\s+/g, ' ')
  .trim();
return { json: {
  ...base,
  candidateName: candidateName || ('Candidate ' + String(base.driveFileId || '').slice(-6)),
  candidateEmail: email,
  preferredMobile: mobile,
  applicantCountry: country,
} };`,
    },
    position: [5840, 220],
  },
  output: [{ applicationId: 'APP-BULK-resume-file-id', roleId: 'GM01', roleName: 'General Manager', submittedAt: '2025-12-03T09:15:00+08:00', resumeText: 'Candidate resume text.', candidateName: 'Alex Chen', candidateEmail: '', preferredMobile: '', applicantCountry: 'PH' }],
});

const submitPause = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: {
    name: 'Pause Before Screening Submission',
    parameters: { resume: 'timeInterval', amount: 3, unit: 'seconds' },
    position: [6120, 220],
  },
  output: [{
    applicationId: 'APP-BULK-resume-file-id',
    roleId: 'GM01',
    roleName: 'General Manager',
    submittedAt: '2025-12-03T09:15:00+08:00',
    resumeText: 'Candidate resume text.',
    candidateName: 'Alex Chen',
    candidateEmail: '',
    preferredMobile: '',
    applicantCountry: 'PH',
  }],
});

const submit = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Submit Candidate to Screening Workflow',
    parameters: {
      method: 'POST',
      url: 'https://n8n.srv1457709.hstgr.cloud/webhook/candidate-application',
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'X-Idempotency-Key', value: expr('{{ $json.applicationId }}') },
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ eventType: "candidate_application_submitted", applicationId: $json.applicationId, roleId: $json.roleId, Role_ID: $json.roleId, jobTitle: $json.roleName, department: "", candidate: { name: $json.candidateName, email: $json.candidateEmail, phone: $json.preferredMobile, preferredMobile: $json.preferredMobile, applicantCountry: $json.applicantCountry, resumeText: $json.resumeText, salaryExpectation: "", salaryCurrency: "", noticePeriod: "", availability: "", skillsAssessment: "", roleExpectations: "", applicationSource: "HR Drive Bulk Upload", consent: false }, submittedAt: $json.submittedAt, source: "JD Role Folder Google Drive Resume", applicationSource: "HR Drive Bulk Upload", environment: $json.environment || "production", is_uat: $json.is_uat === true, batchId: $json.batchId || "", jobId: $json.jobId || ("DRIVE-" + $json.roleId + "-" + $json.driveFileId) }) }}'),
      options: {
        timeout: 120000,
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
      },
    },
    onError: 'continueRegularOutput',
    position: [6400, 220],
  },
  output: [{ statusCode: 201, body: { success: true, applicationId: 'APP-BULK-resume-file-id' } }],
});

const evaluate = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluate Screening Submission',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const base = $('Normalize Optional Candidate Contact').item.json;
const response = $json.body || $json;
const statusCode = Number($json.statusCode || 0);
const accepted = statusCode >= 200 && statusCode < 300 && response.success !== false;
const now = new Date().toISOString();
return { json: {
  ...base,
  status: accepted ? 'Screened' : 'Failed',
  submissionAccepted: accepted,
  errorMessage: accepted ? '' : String($json.error?.message || response.error || response.message || 'Candidate Foundation handoff failed before a response was received.'),
  processedAt: accepted ? now : '',
  lastUpdated: now,
} };`,
    },
    position: [6680, 220],
  },
  output: [{ status: 'Screened', submissionAccepted: true }],
});

const accepted = ifElse({
  version: 2.3,
  config: {
    name: 'Screening Submission Accepted',
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 1 },
        conditions: [{ leftValue: expr('{{ $json.submissionAccepted }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: true }],
        combinator: 'and',
      },
    },
    position: [6960, 220],
  },
});

const saveScreened = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Record Resume Screened',
    parameters: queueAppendParameters,
    credentials: sheetsCredentials,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [7240, 120],
  },
  output: [{ driveFileId: 'resume-file-id', status: 'Screened' }],
});

const saveSubmissionFailure = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Record Screening Failure',
    parameters: queueAppendParameters,
    credentials: sheetsCredentials,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [7240, 320],
  },
  output: [{ driveFileId: 'resume-file-id', status: 'Failed' }],
});

const prepareExtractionFailure = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare Extraction Failure',
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: `const now = new Date().toISOString();
return { json: { ...$json, status: 'Failed', errorMessage: String($json.stageError || 'Resume extraction failed.'), processedAt: '', lastUpdated: now } };`,
    },
    position: [5280, 420],
  },
  output: [{ driveFileId: 'resume-file-id', status: 'Failed' }],
});

const saveExtractionFailure = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Record Extraction Failure',
    parameters: queueAppendParameters,
    credentials: sheetsCredentials,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 20000,
    position: [5560, 420],
  },
  output: [{ driveFileId: 'resume-file-id', status: 'Failed' }],
});

const successPause = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Pause After Success', parameters: { resume: 'timeInterval', amount: 5, unit: 'seconds' }, position: [7520, 120] },
  output: [{ status: 'Screened' }],
});

const submissionFailurePause = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Pause After Screening Failure', parameters: { resume: 'timeInterval', amount: 5, unit: 'seconds' }, position: [7520, 320] },
  output: [{ status: 'Failed' }],
});

const extractionFailurePause = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Pause After Extraction Failure', parameters: { resume: 'timeInterval', amount: 5, unit: 'seconds' }, position: [5840, 420] },
  output: [{ status: 'Failed' }],
});

export default workflow('MWt7W7LNFNZxcc0q', 'JD Role Folder Bulk Resume Screening')
  .add(schedule)
  .to(readMap)
  .to(activeMap)
  .to(searchMonthFolders)
  .to(tagMonthFolders)
  .to(validMonthFolders)
  .to(searchResumes)
  .to(tagResumes)
  .to(readQueue)
  .to(readApplicants)
  .to(selectDue)
  .to(claim)
  .to(batch
    .onDone(finish)
    .onEachBatch(discoveryPause
      .to(download)
      .to(extract)
      .to(checkExtraction)
      .to(extractionReady
        .onTrue(normalizeContact
          .to(submitPause)
          .to(submit)
          .to(evaluate)
          .to(accepted
            .onTrue(saveScreened.to(successPause).to(nextBatch(batch)))
            .onFalse(saveSubmissionFailure.to(submissionFailurePause).to(nextBatch(batch)))))
        .onFalse(prepareExtractionFailure
          .to(saveExtractionFailure)
          .to(extractionFailurePause)
          .to(nextBatch(batch))))));
