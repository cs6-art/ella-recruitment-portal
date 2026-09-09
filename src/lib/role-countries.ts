export const ROLE_COUNTRY_CODES = ["PH", "SG", "MY"] as const;

export type RoleCountryCode = typeof ROLE_COUNTRY_CODES[number];

export type RoleCountryProfile = {
  code: RoleCountryCode;
  name: string;
  dialCode: string;
  currencyCode: "PHP" | "SGD" | "MYR";
  currencySymbol: string;
  currencyName: string;
  phonePlaceholder: string;
};

export const ROLE_COUNTRY_PROFILES: Record<RoleCountryCode, RoleCountryProfile> = {
  PH: { code: "PH", name: "Philippines", dialCode: "63", currencyCode: "PHP", currencySymbol: "₱", currencyName: "Philippine peso", phonePlaceholder: "917 123 4567" },
  SG: { code: "SG", name: "Singapore", dialCode: "65", currencyCode: "SGD", currencySymbol: "S$", currencyName: "Singapore dollar", phonePlaceholder: "8123 4567" },
  MY: { code: "MY", name: "Malaysia", dialCode: "60", currencyCode: "MYR", currencySymbol: "RM", currencyName: "Malaysian ringgit", phonePlaceholder: "12 345 6789" },
};

export function isRoleCountry(value: unknown): value is RoleCountryCode {
  return typeof value === "string" && ROLE_COUNTRY_CODES.includes(value.trim().toUpperCase() as RoleCountryCode);
}

export function roleCountryProfile(value: unknown): RoleCountryProfile | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return isRoleCountry(code) ? ROLE_COUNTRY_PROFILES[code] : null;
}

export function roleOptionLabel(roleTitle: string, roleId: string, country: unknown) {
  const profile = roleCountryProfile(country);
  return `${roleTitle || roleId} (${roleId}${profile ? ` (${profile.code})` : ""})`;
}
