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
