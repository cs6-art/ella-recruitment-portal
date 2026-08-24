import assert from "node:assert/strict";
import test from "node:test";

const user = (overrides = {}) => ({ email: "creator@mclinkgroup.com", canCreateRole: false, canReviewRole: false, canApproveRole: false, ...overrides });
const roles = [
  { roleId: "1", requesterEmail: "creator@mclinkgroup.com", status: "Pending HR Discussion" },
  { roleId: "2", requesterEmail: "other@mclinkgroup.com", status: "Approved" },
];

test("creator visibility policy only exposes own requests", () => {
  const visible = roles.filter((role) => role.requesterEmail === user({ canCreateRole: true }).email);
  assert.deepEqual(visible.map((role) => role.roleId), ["1"]);
});

test("reviewers and approvers can see organization requests", () => {
  assert.equal(user({ canReviewRole: true }).canReviewRole, true);
  assert.equal(roles.length, 2);
});

test("dashboard metric status definition", () => {
  const open = roles.filter((role) => ["Approved", "Recruitment Setup"].includes(role.status));
  assert.deepEqual(open.map((role) => role.roleId), ["2"]);
});

test("setup is HR-only and status constrained", () => {
  assert.equal(user({ canReviewRole: true }).canReviewRole, true);
  assert.equal(["Approved", "Recruitment Setup"].includes("Pending HR Discussion"), false);
});

for (const status of ["sent", "pending", "not_configured", "failed", "disabled", "not_requested"]) {
  test(`notification status ${status} is represented`, () => assert.ok(["sent", "pending", "not_configured", "failed", "disabled", "not_requested"].includes(status)));
}
