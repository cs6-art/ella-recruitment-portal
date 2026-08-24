"use client";

import { useState } from "react";

type RoleOption = { roleId: string; label: string };

export default function ResumeScreeningInviteGenerator({ roleOptions }: { roleOptions: RoleOption[] }) {
  const [roleId, setRoleId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!roleId || !candidateName.trim() || !candidateEmail.trim() || saving) return;
    setSaving(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/roles/${encodeURIComponent(roleId)}/resume-screening/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ candidateName: candidateName.trim(), candidateEmail: candidateEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to generate the application link.");
      setResult({ link: data.link, expiresAt: data.expiresAt });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate the application link.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card resume-invite-generator" aria-labelledby="resume-invite-title">
      <div>
        <span className="eyebrow-dark">ALTERNATIVE INTAKE</span>
        <h2 id="resume-invite-title">Send an application link</h2>
        <p>Generate a single-use link for one candidate to apply and upload their own resume. It stops working the moment they submit, or after a few days if it goes unused.</p>
      </div>

      <div className="resume-invite-fields">
        <label className="field">
          <span>Published role *</span>
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={saving}>
            <option value="">Select a published role</option>
            {roleOptions.map((role) => <option key={role.roleId} value={role.roleId}>{role.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Candidate name *</span>
          <input type="text" value={candidateName} onChange={(event) => setCandidateName(event.target.value)} disabled={saving} placeholder="Jamie Cruz" />
        </label>
        <label className="field">
          <span>Candidate email *</span>
          <input type="email" value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} disabled={saving} placeholder="jamie.cruz@example.com" />
        </label>
        <button type="button" className="btn btn-primary" disabled={!roleId || !candidateName.trim() || !candidateEmail.trim() || saving} onClick={() => void generate()}>
          {saving ? "Generating..." : "Generate application link"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <div className="success-box resume-invite-result">
          <div className="resume-invite-link-row">
            <input type="text" readOnly value={result.link} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" className="btn btn-secondary" onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</button>
          </div>
          <small>Send this link to the candidate. It can only be used once and expires {new Date(result.expiresAt).toLocaleString()}.</small>
        </div>
      )}
    </section>
  );
}
