"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RoleOption = { roleId: string; label: string };
type QueueItem = {
  driveFileId: string;
  driveFileName: string;
  driveFileUrl: string;
  roleId: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  applicationId: string;
  errorMessage: string;
  discoveredAt: string;
  processingStartedAt: string;
  processedAt: string;
  attemptCount: string;
  lastUpdated: string;
};

const statusOrder = ["Queued", "Processing", "Screened", "Failed", "Skipped"];

function statusClass(status: string) {
  return `bulk-status bulk-status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export default function BulkResumeScreeningPanel({ roleOptions, driveUrl }: { roleOptions: RoleOption[]; driveUrl: string }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [error, setError] = useState("");

  const selectedRole = useMemo(() => roleOptions.find((role) => role.roleId === roleId), [roleId, roleOptions]);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/resume-screening/bulk${roleId ? `?roleId=${encodeURIComponent(roleId)}` : ""}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to load bulk screening status.");
      setItems(result.items || []);
      setCounts(result.counts || {});
      setConfigured(result.configured !== false);
      if (result.error) setError(result.error);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load bulk screening status.");
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function uploadResumes() {
    if (!roleId || files.length === 0 || uploading) return;
    setUploading(true);
    setError("");
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.set("roleId", roleId);
      files.forEach((file) => formData.append("resumes", file));
      const response = await fetch("/api/resume-screening/bulk/upload", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || "Unable to submit the bulk resumes.");
      const submitted = Number(result.submitted || 0);
      const skippedResults = (result.results || []).filter((item: { skipped?: boolean }) => item.skipped) as Array<{ status?: string; message?: string }>;
      const alreadyScreened = skippedResults.filter((item) => item.status?.toLowerCase() === "screened").length;
      const alreadyActive = skippedResults.length - alreadyScreened;
      const uploadSummary = submitted ? `${submitted} resume${submitted === 1 ? "" : "s"} queued for screening` : "No new resumes were queued";
      setUploadMessage(`${uploadSummary}${alreadyScreened ? `; ${alreadyScreened} already screened and skipped` : ""}${alreadyActive ? `; ${alreadyActive} already queued or processing` : ""}.`);
      setFiles([]);
      await refreshStatus();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit the bulk resumes.");
    } finally {
      setUploading(false);
    }
  }

  function openDriveFolder() {
    if (!driveUrl || !roleId) return;
    window.open(driveUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="bulk-screening-panel" aria-labelledby="bulk-screening-title">
      <div className="bulk-screening-header">
        <div>
          <span className="form-eyebrow">BULK RESUME SCREENING</span>
          <h2 id="bulk-screening-title">Bulk upload resumes</h2>
          <p>Select a published role and upload multiple PDF, DOC, or DOCX resumes directly from this page. Ella processes each file once and records its screening status here.</p>
        </div>
        <span className="bulk-screening-badge">One-time screening</span>
      </div>

      <div className="bulk-screening-body">
        <div className="bulk-screening-controls">
          <label className="field">
            <span>Published role *</span>
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              <option value="">Select a published role</option>
              {roleOptions.map((role) => <option key={role.roleId} value={role.roleId}>{role.label}</option>)}
            </select>
          </label>
          <div className="bulk-screening-action">
            {driveUrl && <button type="button" className="btn btn-secondary" disabled={!roleId} onClick={openDriveFolder}>Upload from Google Drive</button>}
          </div>
        </div>

        <div className="bulk-screening-upload-box">
          <label className="field">
            <span>Resume files *</span>
            {/* Match the browser picker with the server PDF/DOC/DOCX allowlist. */}
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple disabled={!roleId || uploading} onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            <small>Select up to 25 PDF, DOC, or DOCX files. Each file may be up to 10 MB.</small>
          </label>
          <button type="button" className="btn btn-primary" disabled={!roleId || files.length === 0 || uploading} onClick={() => void uploadResumes()}>{uploading ? "Queueing resumes..." : `Start screening${files.length ? ` (${files.length})` : ""}`}</button>
        </div>

        {files.length > 0 && <div className="bulk-screening-file-list">{files.map((file) => <span key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</span>)}</div>}
        {uploadMessage && <div className="success-box">{uploadMessage}</div>}

        <div className="bulk-screening-instructions">
          <strong>{selectedRole ? `Upload resumes for ${selectedRole.label}` : "How bulk screening works"}</strong>
          <ol>
            <li>Choose a published role.</li>
            <li>Select multiple PDF, DOC, or DOCX files and start screening.</li>
            <li>Ella extracts the candidate details, submits each resume to the screening workflow, and updates the queue.</li>
            <li>Files marked Screened are identified by role and file hash and are never analyzed again for that role.</li>
          </ol>
        </div>

        <div className="bulk-screening-status-header">
          <div><strong>Screening queue</strong><small>{roleId ? `Status for ${roleId}` : "Select a role to view its queue"}</small></div>
          <button type="button" className="btn btn-secondary" onClick={() => void refreshStatus()} disabled={loading}>{loading ? "Refreshing..." : "Refresh status"}</button>
        </div>

        {!configured && <div className="warning-box">{error || "Create the Bulk_Resume_Queue tab to view processing status."}</div>}
        {configured && error && <div className="error-box">{error}</div>}

        <div className="bulk-screening-counts">
          {statusOrder.map((status) => <div key={status} className="bulk-count-card"><span>{status}</span><strong>{counts[status] || 0}</strong></div>)}
        </div>

        {roleId && items.length > 0 ? (
          <div className="bulk-screening-table-wrap">
            <table className="bulk-screening-table">
              <thead><tr><th>Resume</th><th>Candidate</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {items.map((item) => <tr key={item.driveFileId}>
                  <td>{item.driveFileUrl ? <a href={item.driveFileUrl} target="_blank" rel="noreferrer">{item.driveFileName || item.driveFileId}</a> : item.driveFileName || item.driveFileId}</td>
                  <td>{item.candidateName || item.candidateEmail || "Pending extraction"}</td>
                  <td><span className={statusClass(item.status)}>{item.status || "Queued"}</span>{item.errorMessage && <small className="bulk-screening-error">{item.errorMessage}</small>}</td>
                  <td>{item.lastUpdated || item.processedAt || item.discoveredAt || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="bulk-screening-empty">{roleId ? "No bulk resumes have been detected for this role yet." : "Choose a published role to see its bulk screening status."}</p>}
      </div>
    </section>
  );
}
