"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ActionFeedback from "@/components/ActionFeedback";

type DirectoryUser = {
  email: string;
  fullName: string;
  accessRole: string;
  department: string;
  canCreateRole: boolean;
  canReviewRole: boolean;
  canApproveRole: boolean;
  canEditSettings: boolean;
  canManageUsers: boolean;
  active: boolean;
};

type AccountForm = DirectoryUser;

const emptyForm: AccountForm = {
  email: "",
  fullName: "",
  accessRole: "HR",
  department: "",
  canCreateRole: false,
  canReviewRole: true,
  canApproveRole: false,
  canEditSettings: false,
  canManageUsers: false,
  active: true,
};

function permissionLabels(user: DirectoryUser) {
  return [
    user.canCreateRole && "Create roles",
    user.canReviewRole && "Review roles",
    user.canApproveRole && "Approve roles",
    user.canEditSettings && "Edit settings",
    user.canManageUsers && "Manage users",
  ].filter(Boolean).join(" · ") || "No elevated permissions";
}

export default function UserAccountsEditor({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [originalEmail, setOriginalEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/user-directory", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to load user accounts.");
      setUsers(data.users || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load user accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  const activeCount = useMemo(() => users.filter((user) => user.active).length, [users]);
  const adminCount = useMemo(() => users.filter((user) => user.canEditSettings && user.active).length, [users]);

  function openNewForm() {
    setOriginalEmail("");
    setForm(emptyForm);
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(user: DirectoryUser) {
    setOriginalEmail(user.email);
    setForm({ ...user });
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function updateForm<Key extends keyof AccountForm>(key: Key, value: AccountForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const endpoint = originalEmail ? `/api/user-directory?originalEmail=${encodeURIComponent(originalEmail)}` : "/api/user-directory";
      const response = await fetch(endpoint, {
        method: originalEmail ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to save the user account.");
      setMessage(data.message || "User account saved successfully.");
      setShowForm(false);
      await loadUsers();
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the user account.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: DirectoryUser) {
    if (user.email === currentEmail.trim().toLowerCase()) return;
    const action = user.active ? "deactivate" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${action} ${user.fullName || user.email}?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/user-directory?originalEmail=${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...user, active: !user.active }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error(data.error || `Unable to ${action} the account.`);
      setMessage(user.active ? "User account deactivated." : "User account reactivated.");
      await loadUsers();
      router.refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : `Unable to ${action} the account.`);
    }
  }

  return (
    <main className="container page user-accounts-page">
      <header className="hero-row user-accounts-header">
        <div>
          <span className="eyebrow-dark">ACCESS ADMINISTRATION</span>
          <h1>User Accounts &amp; Roles</h1>
          <p>Manage who can sign in and which recruitment actions each account can perform.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNewForm}>Add user account</button>
      </header>

      <section className="settings-guide user-accounts-guide">
        <span className="settings-guide-icon">i</span>
        <div>
          <strong>User_Directory is the access source of truth</strong>
          <p>Active accounts can sign in. Permission switches control navigation and API actions. Accounts are deactivated instead of deleted so access history is preserved.</p>
        </div>
      </section>

      {error && <ActionFeedback kind="error">{error}</ActionFeedback>}
      {message && <ActionFeedback kind="success">{message}</ActionFeedback>}

      <section className="user-account-stats" aria-label="Account summary">
        <div className="stat-card"><span>Total accounts</span><strong>{users.length}</strong></div>
        <div className="stat-card"><span>Active accounts</span><strong>{activeCount}</strong></div>
        <div className="stat-card"><span>Settings administrators</span><strong>{adminCount}</strong></div>
      </section>

      {showForm && <section className="card user-account-form-card">
        <div className="card-header"><div><h2>{originalEmail ? "Edit user account" : "Add user account"}</h2><p>Set the account identity, department, and allowed actions.</p></div><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button></div>
        <form className="user-account-form" onSubmit={(event) => void save(event)}>
          <div className="field"><label htmlFor="user-full-name">Full name</label><input id="user-full-name" value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} required /></div>
          <div className="field"><label htmlFor="user-email">Email address</label><input id="user-email" type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} required /></div>
          <div className="field"><label htmlFor="user-access-role">Access role</label><input id="user-access-role" value={form.accessRole} onChange={(event) => updateForm("accessRole", event.target.value)} placeholder="HR or HOD" required /></div>
          <div className="field"><label htmlFor="user-department">Department</label><input id="user-department" value={form.department} onChange={(event) => updateForm("department", event.target.value)} placeholder="AI, Finance, Operations" /></div>
          <fieldset className="user-account-permissions"><legend>Permissions</legend><label><input type="checkbox" checked={form.canCreateRole} onChange={(event) => updateForm("canCreateRole", event.target.checked)} /> Create role requests</label><label><input type="checkbox" checked={form.canReviewRole} onChange={(event) => updateForm("canReviewRole", event.target.checked)} /> Review role requests</label><label><input type="checkbox" checked={form.canApproveRole} onChange={(event) => updateForm("canApproveRole", event.target.checked)} /> Approve role requests</label><label><input type="checkbox" checked={form.canEditSettings} onChange={(event) => updateForm("canEditSettings", event.target.checked)} /> Edit settings</label><label><input type="checkbox" checked={form.canManageUsers} onChange={(event) => updateForm("canManageUsers", event.target.checked)} /> Manage user accounts and roles</label></fieldset>
          <label className="user-account-active"><input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} /> Account is active</label>
          <div className="user-account-form-actions"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save account"}</button></div>
        </form>
      </section>}

      <section className="card user-account-list-card">
        <div className="card-header"><div><h2>Directory accounts</h2><p>These accounts are read from the <code>User_Directory</code> sheet.</p></div><button type="button" className="btn btn-secondary" onClick={() => void loadUsers()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
        {loading ? <div className="empty">Loading user accounts…</div> : users.length === 0 ? <div className="empty">No user accounts were found.</div> : <div className="table-wrap user-account-table-wrap"><table className="user-account-table"><thead><tr><th>User</th><th>Access role</th><th>Department</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.email}><td><strong>{user.fullName || "Unnamed user"}</strong><span>{user.email}</span></td><td>{user.accessRole || "—"}</td><td>{user.department || "—"}</td><td><span className={`user-account-status ${user.active ? "is-active" : "is-inactive"}`}>{user.active ? "Active" : "Inactive"}</span></td><td>{permissionLabels(user)}</td><td><div className="user-account-actions"><button type="button" className="btn btn-secondary btn-small" onClick={() => openEditForm(user)}>Edit</button><button type="button" className={`btn btn-small ${user.active ? "btn-danger-outline" : "btn-secondary"}`} onClick={() => void toggleActive(user)} disabled={user.email === currentEmail.trim().toLowerCase()}>{user.active ? "Deactivate" : "Reactivate"}</button></div></td></tr>)}</tbody></table></div>}
      </section>
    </main>
  );
}
