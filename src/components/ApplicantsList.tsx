"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicantSummary } from "@/lib/candidate-applications";
import Pagination from "@/components/Pagination";

type Props = {
  applicants: ApplicantSummary[];
  title?: string;
  description?: string;
  topContent?: ReactNode;
};

function stageClass(stage: string) {
  return `applicant-stage applicant-stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function formatDate(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return value || "Not provided";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function scoreValue(value: string) {
  if (!value) return "—";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric % 1 === 0 ? numeric : numeric.toFixed(1)}%` : value;
}

export default function ApplicantsList({ applicants, title = "Applicants", description = "Review candidates across every published role.", topContent }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [stageFilter, setStageFilter] = useState("All Stages");

  const roles = useMemo(() => [...new Set(applicants.map((applicant) => applicant.selectedRole || applicant.roleId).filter(Boolean))].sort(), [applicants]);
  const stages = useMemo(() => [...new Set(applicants.map((applicant) => applicant.currentStage).filter(Boolean))].sort(), [applicants]);

  const visibleApplicants = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applicants.filter((applicant) => {
      const searchable = `${applicant.applicationId} ${applicant.candidateName} ${applicant.email} ${applicant.roleId} ${applicant.selectedRole} ${applicant.department}`.toLowerCase();
      return (!query || searchable.includes(query)) &&
        (roleFilter === "All Roles" || (applicant.selectedRole || applicant.roleId) === roleFilter) &&
        (stageFilter === "All Stages" || applicant.currentStage === stageFilter);
    });
  }, [applicants, roleFilter, search, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleApplicants.length / pageSize));
  const pagedApplicants = visibleApplicants.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const voiceCount = applicants.filter((applicant) => applicant.voiceStatus || applicant.finalStatus.toLowerCase().includes("voice")).length;
  const finalInterviewCount = applicants.filter((applicant) => applicant.finalInterviewStatus && applicant.finalInterviewStatus.toLowerCase() !== "pending").length;

  return (
    <main className="container page applicants-page">
      <div className="hero-row applicants-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="applicants-header-meta"><strong>{applicants.length}</strong><span>Total applications</span></div>
      </div>

      {topContent}

      <div className="applicant-stat-grid">
        <div className="applicant-stat"><span>Applications</span><strong>{applicants.length}</strong><small>All records in High_Match_Profile</small></div>
        <div className="applicant-stat"><span>Resume Screened</span><strong>{applicants.filter((applicant) => applicant.resumeStatus === "Processed").length}</strong><small>Processed applications</small></div>
        <div className="applicant-stat"><span>Voice Interview</span><strong>{voiceCount}</strong><small>With voice workflow activity</small></div>
        <div className="applicant-stat"><span>Final Interview</span><strong>{finalInterviewCount}</strong><small>Moved beyond voice screening</small></div>
      </div>

      <section className="card applicants-card">
        <div className="applicants-toolbar">
          <div><h2>Applicant Pipeline</h2><span>{visibleApplicants.length} matching applicant{visibleApplicants.length === 1 ? "" : "s"}</span></div>
          <div className="applicants-filters">
            <input aria-label="Search applicants" placeholder="Search candidate, role, or ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}><option>All Roles</option>{roles.map((role) => <option key={role}>{role}</option>)}</select>
            <select aria-label="Filter by stage" value={stageFilter} onChange={(event) => { setStageFilter(event.target.value); setPage(1); }}><option>All Stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
            <label className="pagination-size-control">Rows
              <select aria-label="Applicants per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value="10">10</option><option value="25">25</option><option value="50">50</option>
              </select>
            </label>
          </div>
        </div>

        {visibleApplicants.length === 0 ? (
          <div className="empty">No applicants match the current filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="applicants-table">
              <thead><tr><th>Candidate</th><th>Role</th><th>Applied</th><th>Match</th><th>Current Stage</th><th>Next Action</th><th>Action</th></tr></thead>
              <tbody>
                {pagedApplicants.map((applicant) => (
                  <tr key={applicant.applicationId}>
                    <td><Link className="applicant-name-link" href={`/applicants/${encodeURIComponent(applicant.applicationId)}`}><strong>{applicant.candidateName || "Unnamed candidate"}</strong><span>{applicant.email || applicant.applicationId}</span></Link></td>
                    <td><strong>{applicant.selectedRole || "Role not provided"}</strong><span className="applicant-subtext">{applicant.roleId}</span></td>
                    <td>{formatDate(applicant.appliedAt)}</td>
                    <td><strong className="applicant-score">{scoreValue(applicant.matchScore)}</strong>{applicant.recommendation && <span className="applicant-subtext">{applicant.recommendation}</span>}</td>
                    <td><span className={stageClass(applicant.currentStage)}>{applicant.currentStage || "Submitted"}</span></td>
                    <td>{applicant.nextAction}</td>
                    <td><Link href={`/applicants/${encodeURIComponent(applicant.applicationId)}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visibleApplicants.length > 0 && <Pagination page={page} totalPages={totalPages} totalItems={visibleApplicants.length} pageSize={pageSize} onPageChange={setPage} />}
      </section>
    </main>
  );
}
