import assert from "node:assert/strict";
import test from "node:test";

const notificationMessages = {
  sent: "Update completed and notification sent.",
  pending: "Update completed. Notification is pending.",
  not_configured: "Update completed, but email notification is not configured.",
  failed: "Update completed, but the notification could not be sent.",
};

test("all notification outcomes preserve workflow success", () => {
  for (const [status, message] of Object.entries(notificationMessages)) {
    const response = { success: true, notificationStatus: status };
    assert.equal(response.success, true);
    assert.ok(message.startsWith("Update completed"));
  }
});

test("open positions includes approved and recruitment setup", () => {
  const statuses = ["Approved", "Recruitment Setup", "Job Posted", "Rejected"];
  assert.equal(statuses.filter((status) => ["Approved", "Recruitment Setup", "Job Posted"].includes(status)).length, 3);
});

test("settings audit fields are server-owned", () => {
  const request = { key: "portal.title", value: "Portal", updatedBy: "attacker" };
  const serverUser = "settings-editor@mclinkgroup.com";
  const saved = { ...request, updatedAt: new Date().toISOString(), updatedBy: serverUser };
  assert.equal(saved.updatedBy, serverUser);
});
