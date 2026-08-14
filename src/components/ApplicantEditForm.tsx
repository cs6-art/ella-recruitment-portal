"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import ActionFeedback from "@/components/ActionFeedback";
import { countryOptions, CountryFlag } from "@/components/CountryOptions";

type ApplicantEditValues = { applicationId: string; candidateName: string; email: string; contactNumber: string; roleId: string; selectedRole: string; department: string; applicantCountry: string };

export default function ApplicantEditForm({ applicant }: { applicant: ApplicantEditValues }) {
  const router = useRouter();
  const [candidateName, setCandidateName] = useState(applicant.candidateName);
  const [email, setEmail] = useState(applicant.email);
  const initialCountry = countryOptions.find((country) => applicant.contactNumber.replace(/\D/g, "").replace(/^00/, "").startsWith(country.code.slice(1))) || countryOptions[0];
  const initialLocalNumber = applicant.contactNumber.replace(/\D/g, "").replace(/^00/, "").startsWith(initialCountry.code.slice(1)) ? applicant.contactNumber.replace(/\D/g, "").replace(/^00/, "").slice(initialCountry.code.length - 1) : applicant.contactNumber.replace(/\D/g, "");
  const [countryCode, setCountryCode] = useState(initialCountry.code);
  const [localNumber, setLocalNumber] = useState(initialLocalNumber);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const selectedCountry = countryOptions.find((country) => country.code === countryCode) || countryOptions[0];
      const preferredMobile = `${countryCode}${localNumber.replace(/\D/g, "")}`;
      const response = await fetch(`/api/applicants/${encodeURIComponent(applicant.applicationId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ candidateName, email, preferredMobile, applicantCountry: selectedCountry.country }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success !== true) throw new Error(data.error || "Unable to update the applicant.");
      router.push(`/applicants/${encodeURIComponent(applicant.applicationId)}?updated=1`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the applicant.");
      setSaving(false);
    }
  }

  const selectedCountry = countryOptions.find((country) => country.code === countryCode) || countryOptions[0];
  return <section className="card applicant-edit-card"><div className="card-header"><div><Link className="applicant-back-link" href={`/applicants/${encodeURIComponent(applicant.applicationId)}`}>← Back to applicant</Link><h1>Edit applicant</h1><p>Update the candidate&apos;s contact details without changing their workflow history.</p></div></div>{error && <ActionFeedback kind="error">{error}</ActionFeedback>}<form className="applicant-edit-form" onSubmit={(event) => void submit(event)}><div className="applicant-edit-meta"><div><span>Application ID</span><strong>{applicant.applicationId}</strong></div><div><span>Role</span><strong>{applicant.selectedRole || applicant.roleId}</strong><small>{applicant.department}</small></div></div><label>Full name *<input required minLength={2} maxLength={150} value={candidateName} onChange={(event) => setCandidateName(event.target.value)} /></label><label>Email address *<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Preferred mobile number *<div className="contact-number-controls"><div className="country-code-control"><CountryFlag country={selectedCountry} /><select aria-label="Country code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.code} {country.label}</option>)}</select></div><input required inputMode="numeric" placeholder={selectedCountry.placeholder} value={localNumber} onChange={(event) => setLocalNumber(event.target.value.replace(/\D/g, ""))} /></div><small>Enter the local number only, without the country code.</small></label><div className="applicant-edit-actions"><Link className="btn btn-secondary" href={`/applicants/${encodeURIComponent(applicant.applicationId)}`}>Cancel</Link><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button></div></form></section>;
}
