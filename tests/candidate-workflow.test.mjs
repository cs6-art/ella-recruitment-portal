import assert from "node:assert/strict";
import test from "node:test";

function duplicateRule(rows, roleId, email) {
  const wantedRoleId = String(roleId).trim().toLowerCase();
  const wantedEmail = String(email).trim().toLowerCase();
  return rows.find((row) => {
    const sameRole = String(row.roleId || "").trim().toLowerCase() === wantedRoleId;
    const sameEmail = String(row.email || "").trim().toLowerCase() === wantedEmail;
    const rejected = String(row.finalStatus || "").trim().toLowerCase().includes("reject");
    return sameRole && sameEmail && !rejected;
  }) || null;
}

function historyPair(previousStatus, newStatus) {
  return { previousStatus, newStatus };
}

test("duplicate applications block the same email on the same role unless rejected", () => {
  const rows = [
    { applicationId: "APP-1", roleId: "ROLE-1", email: "candidate@example.com", finalStatus: "Pending Manual Review" },
    { applicationId: "APP-2", roleId: "ROLE-2", email: "candidate@example.com", finalStatus: "Pending Manual Review" },
    { applicationId: "APP-3", roleId: "ROLE-1", email: "candidate@example.com", finalStatus: "Rejected" },
  ];

  assert.equal(duplicateRule(rows, "ROLE-1", "candidate@example.com")?.applicationId, "APP-1");
  assert.equal(duplicateRule(rows, "ROLE-2", "candidate@example.com")?.applicationId, "APP-2");
  assert.equal(duplicateRule(rows, "ROLE-1", "other@example.com"), null);
  assert.equal(duplicateRule(rows, "ROLE-1", "candidate@example.com"), rows[0]);
});

test("duplicate applications allow reapplication when all same-role matches are rejected", () => {
  const rows = [
    { applicationId: "APP-1", roleId: "ROLE-1", email: "candidate@example.com", finalStatus: "Rejected" },
    { applicationId: "APP-2", roleId: "ROLE-1", email: "candidate@example.com", finalStatus: "Voice Interview Rejected" },
  ];

  assert.equal(duplicateRule(rows, "ROLE-1", "candidate@example.com"), null);
});

test("candidate history records the previous and new status pair", () => {
  const entry = historyPair("Pending HR Discussion", "Approved for AI Voice Interview");
  assert.equal(entry.previousStatus, "Pending HR Discussion");
  assert.equal(entry.newStatus, "Approved for AI Voice Interview");
});
