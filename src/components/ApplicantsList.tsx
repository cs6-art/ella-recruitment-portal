"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import ActionFeedback from "@/components/ActionFeedback";
import { useConfirmation } from "@/components/ConfirmationModal";
import type { ApplicantSummary } from "@/lib/candidate-applications";
import Pagination from "@/components/Pagination";
import { formatMatchScore } from "@/lib/score-format";

type Props = {
  applicants: ApplicantSummary[];
  title?: string;
  description?: string;
  topContent?: ReactNode;
  publishedRoles?: { roleId: string; label: string }[];
  canManageApplicants?: boolean;
};

type RoleOption = { value: string; label: string; roleId?: string };

function stageClass(stage: string) {
  return `applicant-stage applicant-stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function formatDate(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return value || "Not provided";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function scoreValue(value: string) {
  if (!value) return "—";
  return formatMatchScore(value);
}

export default function ApplicantsList({ applicants, title = "Applicants", description = "Review candidates across every published role.", topContent, publishedRoles, canManageApplicants = false }: Props) {
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [deletingId, setDeletingId] = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const publishedRoleKeys = useMemo(() => new Set((publishedRoles || []).flatMap((role) => [role.roleId, role.label])), [publishedRoles]);
  const hasPublishedRoleScope = publishedRoles !== undefined;
  const roleOptions = useMemo<RoleOption[]>(() => {
    if (hasPublishedRoleScope) {
      const unique = new Map<string, RoleOption>();
      (publishedRoles || []).forEach((role) => {
        const value = role.roleId || role.label;
        if (!unique.has(value)) unique.set(value, { value, label: role.label, roleId: role.roleId });
      });
      return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
    }
    return [...new Set(applicants.map((applicant) => applicant.selectedRole || applicant.roleId).filter(Boolean))]
      .sort()
      .map((role) => ({ value: role, label: role }));
  }, [applicants, hasPublishedRoleScope, publishedRoles]);
  const activeApplicants = useMemo(() => applicants.filter((applicant) => !removedIds.has(applicant.applicationId)), [applicants, removedIds]);
  const stages = useMemo(() => [...new Set(applicants.map((applicant) => applicant.currentStage).filter(Boolean))].sort(), [applicants]);

  const visibleApplicants = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedRole = roleOptions.find((role) => role.value === roleFilter);
    return activeApplicants.filter((applicant) => {
      const applicantRole = applicant.selectedRole || applicant.roleId;
      const searchable = `${applicant.applicationId} ${applicant.candidateName} ${applicant.email} ${applicant.roleId} ${applicant.selectedRole} ${applicant.department}`.toLowerCase();
      return (!query || searchable.includes(query)) &&
        (!hasPublishedRoleScope || publishedRoleKeys.has(applicantRole) || publishedRoleKeys.has(applicant.roleId)) &&
        (roleFilter === "All Roles" || applicant.roleId === selectedRole?.roleId || applicantRole === roleFilter || applicant.selectedRole === selectedRole?.label) &&
        (stageFilter === "All Stages" || applicant.currentStage === stageFilter);
    });
  }, [activeApplicants, hasPublishedRoleScope, publishedRoleKeys, roleFilter, roleOptions, search, stageFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleApplicants.length / pageSize));
  const pagedApplicants = visibleApplicants.slice((page - 1) * pageSize, page * pageSize);
  const selectedApplicants = activeApplicants.filter((applicant) => selectedIds.has(applicant.applicationId));
  const allVisibleSelected = canManageApplicants && visibleApplicants.length > 0 && visibleApplicants.every((applicant) => selectedIds.has(applicant.applicationId));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const voiceCount = activeApplicants.filter((applicant) => applicant.voiceStatus || applicant.finalStatus.toLowerCase().includes("voice")).length;
  const finalInterviewCount = activeApplicants.filter((applicant) => applicant.finalInterviewStatus && applicant.finalInterviewStatus.toLowerCase() !== "pending").length;

  async function deleteApplicants(applicantsToDelete: ApplicantSummary[]) {
    if (applicantsToDelete.length === 0) return;
    const countLabel = applicantsToDelete.length === 1 ? applicantsToDelete[0].candidateName || "this applicant" : `${applicantsToDelete.length} applicants`;
    if (!(await confirm({ title: "Delete applicant record?", message: `Delete ${countLabel}? This removes the applicant, screening evidence, history, and linked interview slots.`, confirmLabel: "Delete", tone: "danger" }))) return;

    const ids = applicantsToDelete.map((applicant) => applicant.applicationId);
    setDeletingId(ids.length === 1 ? ids[0] : "bulk");
    setDeletingIds(new Set(ids));
    setActionError("");
    setActionMessage("");

    const results: PromiseSettledResult<string>[] = [];
    for (const applicationId of ids) {
      try {
        const response = await fetch(`/api/applicants/${encodeURIComponent(applicationId)}`, { method: "DELETE", credentials: "same-origin" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success !== true) throw new Error(data.error || `Unable to delete ${applicationId}.`);
        results.push({ status: "fulfilled", value: applicationId });
      } catch (error) {
        results.push({ status: "rejected", reason: error });
      }
    }
    const deletedIds = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failedCount = results.length - deletedIds.length;

    if (deletedIds.length > 0) {
      setRemovedIds((current) => new Set([...current, ...deletedIds]));
      setSelectedIds((current) => {
        const next = new Set(current);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      setActionMessage(`${deletedIds.length} applicant${deletedIds.length === 1 ? "" : "s"} deleted successfully.${failedCount ? ` ${failedCount} could not be deleted.` : ""}`);
    }
    if (failedCount > 0) {
      const firstFailure = results.find((result) => result.status === "rejected");
      setActionError(firstFailure?.status === "rejected" && firstFailure.reason instanceof Error ? firstFailure.reason.message : "Some applicants could not be deleted.");
    }
    if (deletedIds.length > 0) router.refresh();
    setDeletingIds(new Set());
    setDeletingId("");
  }

  function toggleApplicantSelection(applicationId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  }

  function toggleAllVisibleApplicants() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleApplicants.forEach((applicant) => next.delete(applicant.applicationId));
      else visibleApplicants.forEach((applicant) => next.add(applicant.applicationId));
      return next;
    });
  }

  return (
    <main className="container page applicants-page">
      <div className="hero-row applicants-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="applicants-header-meta"><strong>{activeApplicants.length}</strong><span>Total applications</span></div>
      </div>

      {actionMessage && <ActionFeedback kind="success" className="applicants-action-feedback">{actionMessage}</ActionFeedback>}
      {actionError && <ActionFeedback kind="error" className="applicants-action-feedback">{actionError}</ActionFeedback>}

      {topContent && <div className="applicants-intake-section">{topContent}</div>}

      <div className="applicant-stat-grid">
        <div className="applicant-stat"><span>Applications</span><strong>{activeApplicants.length}</strong><small>All records in High_Match_Profile</small></div>
        <div className="applicant-stat"><span>Resume Screened</span><strong>{activeApplicants.filter((applicant) => ["processed", "for hr review", "pending hr review"].includes(applicant.resumeStatus.trim().toLowerCase())).length}</strong><small>Processed applications</small></div>
        <div className="applicant-stat"><span>Voice Interview</span><strong>{voiceCount}</strong><small>With voice workflow activity</small></div>
        <div className="applicant-stat"><span>Final Interview</span><strong>{finalInterviewCount}</strong><small>Moved beyond voice screening</small></div>
      </div>

      <section className="card applicants-card">
        <div className="applicants-toolbar">
          <div><h2>Applicant Pipeline</h2><span>{visibleApplicants.length} matching applicant{visibleApplicants.length === 1 ? "" : "s"}</span></div>
          {canManageApplicants && <div className="bulk-selection-toolbar"><span>{selectedApplicants.length} selected</span><button type="button" className="btn btn-danger-outline" disabled={selectedApplicants.length === 0 || deletingId !== ""} onClick={() => void deleteApplicants(selectedApplicants)}>Delete selected</button></div>}
          <div className="applicants-filters">
            <input aria-label="Search applicants" placeholder="Search candidate, role, or ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}><option>All Roles</option>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
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
              <thead><tr>{canManageApplicants && <th className="selection-column"><input type="checkbox" aria-label="Select all visible applicants" checked={allVisibleSelected} onChange={toggleAllVisibleApplicants} /></th>}<th>Candidate</th><th>Role</th><th>Applied</th><th>Match</th><th>Current Stage</th><th>Next Action</th><th>Action</th></tr></thead>
              <tbody>
                {pagedApplicants.map((applicant, index) => (
                  <tr key={`${applicant.applicationId || "applicant"}-${applicant.roleId || "role"}-${index}`} className={selectedIds.has(applicant.applicationId) ? "is-selected" : undefined}>
                    {canManageApplicants && <td className="selection-column"><input type="checkbox" aria-label={`Select ${applicant.candidateName || applicant.applicationId}`} checked={selectedIds.has(applicant.applicationId)} disabled={deletingIds.has(applicant.applicationId)} onChange={() => toggleApplicantSelection(applicant.applicationId)} /></td>}
                    {/* data-label values let the responsive CSS render each row as a
                        labeled card when the table cannot fit the content column. */}
                    <td data-label="Candidate"><Link className="applicant-name-link" href={`/applicants/${encodeURIComponent(applicant.applicationId)}`}><strong>{applicant.candidateName || "Unnamed candidate"}</strong><span>{applicant.email || applicant.applicationId}</span></Link></td>
                    <td data-label="Role"><strong>{applicant.selectedRole || "Role not provided"}</strong><span className="applicant-subtext">{applicant.roleId}</span></td>
                    <td data-label="Applied">{formatDate(applicant.appliedAt)}</td>
                    <td data-label="Match"><strong className="applicant-score">{scoreValue(applicant.matchScore)}</strong>{applicant.recommendation && <span className="applicant-subtext">{applicant.recommendation}</span>}</td>
                    <td data-label="Current stage"><span className={stageClass(applicant.currentStage)}>{applicant.currentStage || "Submitted"}</span></td>
                    <td data-label="Next action">{applicant.nextAction}</td>
                    <td data-label="Action"><div className="applicant-table-actions"><Link href={`/applicants/${encodeURIComponent(applicant.applicationId)}`}>View</Link>{canManageApplicants && <><Link href={`/applicants/${encodeURIComponent(applicant.applicationId)}/edit`}>Edit</Link><button type="button" className="table-danger-action" disabled={deletingIds.has(applicant.applicationId) || deletingId === "bulk"} onClick={() => void deleteApplicants([applicant])}>{deletingIds.has(applicant.applicationId) ? "Deleting..." : "Delete"}</button></>}</div></td>
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
