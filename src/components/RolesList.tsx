"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ActionFeedback from "@/components/ActionFeedback";
import Pagination from "@/components/Pagination";
import UiIcon from "@/components/UiIcon";
import { canEditRoleRequest } from "@/lib/access-control";

const statusFilters = [
  "All",
  "Pending HR Discussion",
  "Pending Management Approval",
  "Returned for Revision",
  "On Hold",
  "Approved",
  "Rejected",
  "Recruitment Setup",
  "Job Posted",
  "Posted",
] as const;

type RoleRequest = {
  roleId: string;
  createdAt: string;
  requesterName: string;
  requesterEmail: string;
  department: string;
  requestType: string;
  jobTitle: string;
  numberOfVacancies: number;
  status: string;
  latestComments: string;
  targetHiringDate: string;
};

type RolesApiResponse = {
  success?: boolean;
  roles?: RoleRequest[];
  error?: string;
  pagination?: { page: number; pageSize: number; totalPages: number; total: number };
};

type RolesListProps = {
  canCreateRole: boolean;
  creatorOnly: boolean;
  userEmail: string;
  canReviewRole: boolean;
  canApproveRole: boolean;
};

export default function RolesList({
  canCreateRole,
  creatorOnly,
  userEmail,
  canReviewRole,
  canApproveRole,
}: RolesListProps) {
  const router = useRouter();
  const [roles, setRoles] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusFilters)[number]>("All");
  const [department, setDepartment] = useState("");
  const [requester, setRequester] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRoles, setTotalRoles] = useState(0);
  const [deletingRoleId, setDeletingRoleId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const apiSort = sort === "target-latest" ? "target" : sort;
      const params = new URLSearchParams({ page: String(page), pageSize: "25", sort: apiSort });
      if (statusFilter !== "All") params.set("status", statusFilter);
      if (department.trim()) params.set("department", department.trim());
      if (requester.trim()) params.set("requester", requester.trim());
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/roles?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      const rawResponse = await response.text();

      let data: RolesApiResponse;

      try {
        data = rawResponse
          ? JSON.parse(rawResponse)
          : {
              success: false,
              error: "The server returned an empty response.",
            };
      } catch {
        throw new Error(
          `The server returned invalid JSON. Status: ${response.status}`,
        );
      }

      if (!response.ok || data.success !== true) {
        throw new Error(
          data.error || "Unable to load role requests.",
        );
      }

      setRoles(
        Array.isArray(data.roles)
          ? data.roles
          : [],
      );
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalRoles(data.pagination?.total || 0);
    } catch (loadError) {
      console.error(
        "[Roles List] Failed to load:",
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load role requests.",
      );
    } finally {
      setLoading(false);
    }
  }, [department, page, requester, search, sort, statusFilter]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const visibleRoles = sort === "target-latest"
    ? [...roles].sort((left, right) => {
        const leftDate = left.targetHiringDate || "0000-00-00";
        const rightDate = right.targetHiringDate || "0000-00-00";
        return rightDate.localeCompare(leftDate);
      })
    : roles;

  const filtersActive =
    statusFilter !== "All" ||
    department.trim() !== "" ||
    requester.trim() !== "" ||
    search.trim() !== "" ||
    sort !== "newest";

  function clearFilters() {
    setStatusFilter("All");
    setDepartment("");
    setRequester("");
    setSearch("");
    setSort("newest");
    setPage(1);
  }

  function statusClass(status: string) {
    return `status-badge status-${status
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`;
  }

  function formatDate(value: string, includeTime = false) {
    if (!value || Number.isNaN(Date.parse(value))) {
      return value || "Not provided";
    }

    const date = new Date(
      value.includes("T") ? value : `${value}T00:00:00`,
    );

    return includeTime
      ? date.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : date.toLocaleDateString(undefined, { dateStyle: "medium" });
  }

  function openRole(roleId: string) {
    router.push(`/roles/${encodeURIComponent(roleId)}`);
  }

  function canEditRole(role: RoleRequest) {
    return canEditRoleRequest({ email: userEmail, canReviewRole, canApproveRole }, role);
  }

  async function deleteRole(role: RoleRequest) {
    const activeWarning = ["Approved", "Recruitment Setup", "Job Posted"].includes(role.status.trim())
      ? " This may also remove an approved or published role from the role list."
      : "";
    if (!window.confirm(`Delete ${role.jobTitle || role.roleId}? This role request cannot be recovered.${activeWarning}`)) return;
    setDeletingRoleId(role.roleId); setActionError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/roles/${encodeURIComponent(role.roleId)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to delete the role request.");
      setActionMessage("Role request deleted successfully.");
      await loadRoles();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to delete the role request.");
    } finally {
      setDeletingRoleId("");
    }
  }

  return (
    <main className="container page">
      <div className="hero-row roles-page-header">
        <div className="roles-page-heading">
          <Link
            className="btn btn-secondary roles-back-button"
            href="/dashboard"
            aria-label="Back to Dashboard"
          >
            <span aria-hidden="true">←</span>
            Back to Dashboard
          </Link>

          <h1>{creatorOnly ? "My Role Requests" : "All Role Requests"}</h1>

          <p>
            {creatorOnly
              ? "Track the Role Requests You Submitted."
              : "Review Submitted Staff Addition and Replacement Requests."}
          </p>
        </div>

        <div className="hero-actions roles-page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Refresh role requests"
            onClick={() => {
              void loadRoles();
            }}
            disabled={loading}
          >
            <UiIcon name="refresh" size={16} />{loading ? "Refreshing..." : "Refresh"}
          </button>

          {canCreateRole && (
            <Link
              className="btn btn-primary"
              href="/roles/new"
            >
              <UiIcon name="plus" size={17} />Create Role Request
            </Link>
          )}
        </div>
      </div>

      <section className="card">
        <div className="roles-toolbar-header">
          <div className="roles-toolbar-title">
            <h2>Submitted Requests</h2>
            <span className="roles-result-count" aria-live="polite">
              {loading
                ? "Loading..."
                : `${visibleRoles.length} ${visibleRoles.length === 1 ? "Request" : "Requests"}`}
            </span>
          </div>

          {filtersActive && (
            <button type="button" className="btn btn-secondary roles-clear-button" onClick={clearFilters}>
              <UiIcon name="filter" size={16} />Clear Filters
            </button>
          )}
        </div>

        {actionMessage && <ActionFeedback kind="success" className="roles-action-feedback">{actionMessage}</ActionFeedback>}
        {actionError && <ActionFeedback kind="error" className="roles-action-feedback">{actionError}</ActionFeedback>}

        <div className="roles-filter-grid" aria-label="Role request filters">
          <div className="roles-filter-field">
            <label htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as (typeof statusFilters)[number],
                );
                setPage(1);
              }}
            >
              {statusFilters.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="roles-filter-field">
            <label htmlFor="job-title-filter">Job Title</label>
            <div className="roles-input-with-icon">
              <UiIcon name="search" size={16} />
              <span aria-hidden="true">⌕</span>
              <input id="job-title-filter" aria-label="Search by job title or role ID" placeholder="Search Job Title" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </div>
          </div>

          <div className="roles-filter-field">
            <label htmlFor="department-filter">Department</label>
            <div className="roles-input-with-icon">
              <UiIcon name="search" size={16} />
              <span aria-hidden="true">⌕</span>
              <input id="department-filter" aria-label="Filter by department" placeholder="Search Department" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }} />
            </div>
          </div>

          <div className="roles-filter-field">
            <label htmlFor="requester-filter">Requester</label>
            <div className="roles-input-with-icon">
              <UiIcon name="search" size={16} />
              <span aria-hidden="true">⌕</span>
              <input id="requester-filter" aria-label="Filter by requester" placeholder="Search Requester" value={requester} onChange={(event) => { setRequester(event.target.value); setPage(1); }} />
            </div>
          </div>

          <div className="roles-filter-field">
            <label htmlFor="sort-filter">Sort By</label>
            <select id="sort-filter" aria-label="Sort role requests" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="target">Target Date: Earliest</option>
              <option value="target-latest">Target Date: Latest</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="roles-table-skeleton" aria-label="Loading role requests" role="status">
            {Array.from({ length: 5 }, (_, index) => <div className="roles-skeleton-row" key={index}><span /><span /><span /><span /><span /></div>)}
          </div>
        )}

        {!loading && error && (
          <div className="empty">
            <p>{error}</p>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void loadRoles();
              }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          visibleRoles.length === 0 && (
            <div className="empty">
                No role requests match the current filters.
            </div>
          )}

        {!loading &&
          !error &&
          visibleRoles.length > 0 && (
            <div className="table-wrap">
              <table className="roles-table">
                <thead>
                  <tr>
                    <th className="roles-column-role">Role</th>
                    <th>Department</th>
                    <th>Request Type</th>
                    <th>Vacancies</th>
                    <th>Requester</th>
                    <th>Created</th>
                    <th>Target Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleRoles.map((role) => (
                    <tr
                      key={role.roleId}
                      tabIndex={0}
                      role="link"
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a,button")) return;
                        openRole(role.roleId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRole(role.roleId);
                        }
                      }}
                    >
                      <td className="roles-column-role">
                        <Link className="roles-role-link" href={`/roles/${encodeURIComponent(role.roleId)}`}>
                          <strong>{role.jobTitle || "Not provided"}</strong>
                          <span>{role.roleId}</span>
                        </Link>
                      </td>
                      <td>
                        {role.department || "Not provided"}
                      </td>
                      <td>
                        {role.requestType || "Not provided"}
                      </td>
                      <td>{role.numberOfVacancies}</td>
                      <td>
                        {role.requesterName || "Not provided"}
                      </td>
                      <td>
                        {formatDate(role.createdAt, true)}
                      </td>
                      <td>{formatDate(role.targetHiringDate)}</td>
                      <td>
                        <span className={statusClass(role.status)}>
                          {role.status || "Submitted"}
                        </span>
                      </td>
                      <td><div className="role-table-actions"><Link href={`/roles/${encodeURIComponent(role.roleId)}`}>View</Link>{canEditRole(role) && <><Link href={`/roles/${encodeURIComponent(role.roleId)}/edit`}>Edit</Link><button type="button" className="table-danger-action" disabled={deletingRoleId === role.roleId} onClick={() => void deleteRole(role)}>{deletingRoleId === role.roleId ? "Deleting..." : "Delete"}</button></>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {!loading && !error && totalRoles > 0 && <Pagination page={page} totalPages={totalPages} totalItems={totalRoles} pageSize={25} onPageChange={setPage} />}
      </section>
    </main>
  );
}
