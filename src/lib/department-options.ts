/** Shared department choices for role requests and account administration. */
export const DEPARTMENT_OPTIONS = ["AI", "Marketing", "Finance", "Sales", "HR", "IT", "Other"] as const;

export function isKnownDepartment(value: string): boolean {
  return DEPARTMENT_OPTIONS.some((department) => department.toLowerCase() === value.trim().toLowerCase());
}
