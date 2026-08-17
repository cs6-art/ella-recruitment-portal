"use client";

import { useEffect, useRef, useState } from "react";

import UiIcon from "@/components/UiIcon";

export type CountryOption = {
  code: string;
  country: "PH" | "SG" | "MY";
  flag: "ph" | "sg" | "my";
  label: string;
  placeholder: string;
};

// Applications are only supported for these three countries. Adding a new
// country requires matching support in normalizePreferredMobile/
// isPreferredMobileValid/inferApplicantCountry (src/lib/applicant-workflow.ts)
// and the applicantCountry enum in src/app/api/applicants/[applicationId]/route.ts.
export const countryOptions: CountryOption[] = [
  { code: "+63", country: "PH", flag: "ph", label: "Philippines", placeholder: "917 123 4567" },
  { code: "+65", country: "SG", flag: "sg", label: "Singapore", placeholder: "8123 4567" },
  { code: "+60", country: "MY", flag: "my", label: "Malaysia", placeholder: "12 345 6789" },
];

export function CountryFlag({ country }: { country: CountryOption }) {
  if (country.flag === "ph") {
    return <svg className="country-flag" viewBox="0 0 32 20" role="img" aria-label={`${country.label} flag`}><rect width="32" height="10" fill="#1d4f91" /><rect y="10" width="32" height="10" fill="#c83b45" /><path d="M0 0v20l13-10z" fill="#fff" /><circle cx="5.5" cy="10" r="2" fill="#f4c542" /></svg>;
  }
  if (country.flag === "sg") {
    return <svg className="country-flag" viewBox="0 0 32 20" role="img" aria-label={`${country.label} flag`}><rect width="32" height="10" fill="#d83245" /><rect y="10" width="32" height="10" fill="#fff" /><circle cx="6" cy="5" r="3.6" fill="#fff" /><circle cx="7.3" cy="4.2" r="2.8" fill="#d83245" /><circle cx="11" cy="2.4" r=".55" fill="#fff" /><circle cx="13" cy="4.1" r=".55" fill="#fff" /><circle cx="12.8" cy="6.6" r=".55" fill="#fff" /><circle cx="10.3" cy="7.8" r=".55" fill="#fff" /><circle cx="8.7" cy="6" r=".55" fill="#fff" /></svg>;
  }
  return <svg className="country-flag" viewBox="0 0 32 20" role="img" aria-label={`${country.label} flag`}><rect width="32" height="20" fill="#fff" /><path d="M0 0h32v2.2H0zm0 4.4h32v2.2H0zm0 4.4h32V11H0zm0 4.4h32v2.2H0zm0 4.4h32V20H0z" fill="#c92f43" /><rect width="14" height="11" fill="#123f82" /><circle cx="5.6" cy="5.5" r="3.1" fill="#f4c542" /><circle cx="6.8" cy="4.8" r="2.6" fill="#123f82" /><path d="m9 2.7.75 1.8 1.95.15-1.5 1.2.45 1.9L9 6.7 7.35 7.75l.45-1.9-1.5-1.2 1.95-.15z" fill="#f4c542" /></svg>;
}

export function CountrySelect({ value, onChange, disabled = false, ariaLabel = "Country code" }: { value: string; onChange: (value: string) => void; disabled?: boolean; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const selected = countryOptions.find((country) => country.code === value) || countryOptions[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function selectCountry(country: CountryOption) {
    onChange(country.code);
    setOpen(false);
  }

  return <div className="country-code-control country-select-control" ref={controlRef}>
    <button type="button" className="country-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <CountryFlag country={selected} />
      <span>{selected.code} {selected.label}</span>
      <span className="country-select-chevron" aria-hidden="true"><UiIcon name="chevron-down" size={13} strokeWidth={2.3} /></span>
    </button>
    {open && <div className="country-select-menu" role="listbox" aria-label={ariaLabel}>
      {countryOptions.map((country) => <button type="button" role="option" aria-selected={country.code === selected.code} className={`country-select-option${country.code === selected.code ? " is-selected" : ""}`} key={country.code} onClick={() => selectCountry(country)}>
        <CountryFlag country={country} />
        <span>{country.code} {country.label}</span>
      </button>)}
    </div>}
  </div>;
}
