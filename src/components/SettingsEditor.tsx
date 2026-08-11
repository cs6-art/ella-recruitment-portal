"use client";

import { useEffect, useMemo, useState } from "react";


type Setting = { key: string; value: string; category: string; description: string; updatedAt: string; updatedBy: string };
const categories = ["Portal Settings", "Booking & Interview", "Workflow Rules", "Notifications"];
const categoryDescriptions: Record<string, string> = {
  "Portal Settings": "Basic defaults used across the recruitment portal.",
  "Booking & Interview": "Defaults for the calendar and candidate booking links.",
  "Workflow Rules": "Approval gates that keep the candidate handoffs controlled.",
  Notifications: "How connected automation should notify candidates and HR.",
};

function labelFor(key: string) { return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function isChoice(setting: Setting) { return setting.value === "Yes" || setting.value === "No"; }

export default function SettingsEditor() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/settings", { credentials: "same-origin", cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to load settings."); setSettings(data.settings || []); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load settings.")).finally(() => setLoading(false)); }, []);
  const grouped = useMemo(() => { const known = categories.map((category) => ({ category, items: settings.filter((setting) => setting.category === category) })); const extraCategories = [...new Set(settings.map((setting) => setting.category).filter((category) => !categories.includes(category)))]; return [...known, ...extraCategories.map((category) => ({ category, items: settings.filter((setting) => setting.category === category) }))]; }, [settings]);
  function update(key: string, value: string) { setSettings((current) => current.map((setting) => setting.key === key ? { ...setting, value } : setting)); }
  async function save() { setSaving(true); setError(""); setMessage(""); try { const response = await fetch("/api/settings", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) }); const data = await response.json(); if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to save settings."); setMessage(data.message || "Settings saved successfully."); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save settings."); } finally { setSaving(false); } }
  return <main className="container page settings-page"><header className="hero-row settings-header"><div><span className="eyebrow-dark">PORTAL CONFIGURATION</span><h1>Settings</h1><p>Adjust the defaults HR uses for interviews, approvals, and notifications.</p></div><div className="settings-header-note"><strong>HR Defaults</strong><span>Safe to edit. Secrets stay outside this page.</span></div></header><section className="settings-guide"><span className="settings-guide-icon">i</span><div><strong>What should I change?</strong><p>The defaults are already set for McLink. Start with the timezone and interview durations; leave workflow approvals enabled unless your HR process changes.</p></div></section>{loading && <div className="empty">Loading settings...</div>}{error && <div className="error-box" role="alert">{error}</div>}{message && <div className="success-box" role="status">{message}</div>}{!loading && !error && grouped.map(({ category, items }) => <section className="card settings-section" key={category}><div className="settings-section-header"><div><h2>{category}</h2><p>{categoryDescriptions[category] || "Additional portal configuration."}</p></div><span>{items.length} setting{items.length === 1 ? "" : "s"}</span></div><div className="settings-grid">{items.length === 0 ? <p className="settings-empty">No settings in this category.</p> : items.map((setting) => <div className="settings-field" key={setting.key}><label htmlFor={`setting-${setting.key}`}>{labelFor(setting.key)}</label>{isChoice(setting) ? <select id={`setting-${setting.key}`} value={setting.value} onChange={(event) => update(setting.key, event.target.value)}><option>Yes</option><option>No</option></select> : <input id={`setting-${setting.key}`} value={setting.value} onChange={(event) => update(setting.key, event.target.value)} />}<small>{setting.description || "No description provided."}</small></div>)}</div></section>)}{!loading && !error && <div className="settings-actions"><span>Changes apply to new workflow actions and availability defaults.</span><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Settings"}</button></div>}</main>;
}
