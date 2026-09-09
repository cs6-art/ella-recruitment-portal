import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("the supported role countries map to the correct official currencies", () => {
  const catalog = read("src/lib/role-countries.ts");
  assert.match(catalog, /ROLE_COUNTRY_CODES = \["PH", "SG", "MY"\]/);
  assert.match(catalog, /PH: .*currencyCode: "PHP".*currencySymbol: "₱"/);
  assert.match(catalog, /SG: .*currencyCode: "SGD".*currencySymbol: "S\$"/);
  assert.match(catalog, /MY: .*currencyCode: "MYR".*currencySymbol: "RM"/);
  assert.match(read("src/lib/salary-format.ts"), /MYR: \{ symbol: "RM"/);
});

test("role requests require a country and persist the country for downstream workflows", () => {
  const schema = read("src/lib/role-schema.ts");
  const form = read("src/components/RoleRequestForm.tsx");
  const api = read("src/app/api/roles/route.ts");
  const mapper = read("integrations/n8n/Map Role Request - Code Node.json");
  const foundation = read("integrations/n8n/role-request-foundation.json");
  assert.match(schema, /roleCountry: z\.enum\(ROLE_COUNTRY_CODES/);
  assert.match(form, /id="roleCountry"[^>]*required/);
  assert.match(form, /currencyCode/);
  assert.match(api, /Role_Country: input\.roleCountry/);
  assert.match(api, /roleCountry: input\.roleCountry/);
  assert.match(mapper, /Role_Country: text\(role\.roleCountry\)/);
  assert.match(foundation, /Role_Country:role\.roleCountry/);
});

test("applicant intake does not expose country or currency choices", () => {
  const portalForm = read("src/components/CandidateApplicationForm.tsx");
  const publicForm = read("public/index.html");
  const externalFormPath = "G:\\My Drive\\Downloads\\indexsept.html";
  assert.doesNotMatch(portalForm, /CountrySelect/);
  assert.doesNotMatch(portalForm, /candidate-salary-currency/);
  assert.match(portalForm, /roleCountryProfile/);
  assert.doesNotMatch(publicForm, /id="applicantCountry"/);
  assert.doesNotMatch(publicForm, /id="salaryCurrency"/);
  assert.match(publicForm, /roleCountryProfiles/);
  if (fs.existsSync(externalFormPath)) {
    const externalForm = read(externalFormPath);
    assert.doesNotMatch(externalForm, /id="applicantCountry"/);
    assert.doesNotMatch(externalForm, /id="salaryCurrency"/);
    assert.match(externalForm, /roleCountryProfiles/);
  }
});

test("applicant country filtering and server-side salary derivation are wired", () => {
  const list = read("src/components/ApplicantsList.tsx");
  const applicantData = read("src/lib/candidate-applications.ts");
  const publicRoute = read("src/app/api/public/applications/route.ts");
  const manualRoute = read("src/app/api/applicants/route.ts");
  const rolesRoute = read("src/app/api/public/roles/route.ts");
  assert.match(list, /Filter by country/);
  assert.match(list, /countryFilter/);
  assert.match(list, /applicant\.applicantCountry === countryFilter/);
  assert.match(applicantData, /Applicant_Country/);
  assert.match(publicRoute, /applicantCountry: country\.code/);
  assert.match(publicRoute, /salaryCurrency: country\.currencyCode/);
  assert.match(manualRoute, /applicantCountry: country\.code/);
  assert.match(manualRoute, /salaryCurrency: country\.currencyCode/);
  assert.match(rolesRoute, /roleCountry/);
});

test("public role loading is not blocked by the removed country picker", () => {
  for (const path of ["public/index.html", "G:\\My Drive\\Downloads\\indexsept.html"]) {
    if (!fs.existsSync(path)) continue;
    const form = read(path);
    assert.doesNotMatch(form, /updateCountryPicker\(recruitmentCountry\.value\)/);
    if (path.includes("indexsept.html")) assert.match(form, /loadAvailableRoles\(\);/);
    assert.match(form, /normalizeRecruitmentRole/);
    assert.match(form, /source\.Role_Country, "PH"/);
    assert.match(form, /<label for="role">Role<span/);
  }
});

test("role editing persists country and keeps CRUD actions visible", () => {
  const detailsRoute = read("src/app/api/roles/[roleId]/route.ts");
  const rolesList = read("src/components/RolesList.tsx");
  const styles = read("src/app/globals.css");
  assert.match(detailsRoute, /Role_Country: patchText\(body\.roleCountry, role\.roleCountry, 2\)/);
  assert.match(detailsRoute, /Role_Country: input\.roleCountry/);
  assert.match(read("src/components/RoleRequestForm.tsx"), /roleCountry: "PH"/);
  assert.match(rolesList, /<th>Action<\/th>/);
  assert.match(styles, /\.roles-table th:last-child,[\s\S]*position: sticky/);
  assert.match(styles, /\.roles-table th:nth-child\(6\),[\s\S]*width: 70px/);
});
