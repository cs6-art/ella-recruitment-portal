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
