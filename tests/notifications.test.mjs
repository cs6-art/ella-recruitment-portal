import assert from "node:assert/strict";
import test from "node:test";

import { filterVisibleApplicants } from "../src/lib/access-control.ts";
import {
  applyReadState,
  deriveNotifications,
  emptyReadState,
  withAllNotificationsRead,
  withNotificationRead,
  MAX_NOTIFICATIONS,
} from "../src/lib/notifications.ts";

const NOW = new Date("2026-09-01T09:00:00.000Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function row(overrides = {}) {
  return {
    applicationId: "APP-1",
    candidateName: "Alex Chen",
    roleId: "BDE01",
    roleLabel: "Business Development Executive",
    department: "Sales",
    dateOfApplication: hoursAgo(2),
    lastUpdated: hoursAgo(2),
    resumeStatus: "",
    recommendation: "",
    voiceStatus: "",
    voiceHrDecision: "",
    finalStatus: "",
    finalScheduledDate: "",
    ...overrides,
  };
}

test("a recent application produces one applicant_new notification with a working link", () => {
  const [notification, ...rest] = deriveNotifications([row()], NOW);
  assert.equal(rest.length, 0);
  assert.equal(notification.type, "applicant_new");
  assert.equal(notification.id, "applicant_new:APP-1");
  assert.equal(notification.href, "/applicants/APP-1");
  assert.match(notification.message, /Alex Chen applied for Business Development Executive/);
  assert.equal(notification.read, false);
});

test("applications older than the lookback window are dropped", () => {
  const notifications = deriveNotifications([row({ dateOfApplication: daysAgo(40), lastUpdated: daysAgo(40) })], NOW);
  assert.equal(notifications.length, 0);
});

test("a screened resume with a recommendation is surfaced", () => {
  const notifications = deriveNotifications([
    row({ resumeStatus: "For HR Review", recommendation: "Proceed to voice interview", lastUpdated: hoursAgo(1) }),
  ], NOW);
  const screened = notifications.find((n) => n.type === "resume_screened");
  assert.ok(screened);
  assert.match(screened.message, /Proceed to voice interview/);
});

test("a completed voice interview awaiting a decision is voice_review, not voice_completed", () => {
  const notifications = deriveNotifications([
    row({ voiceStatus: "Interviewed", voiceHrDecision: "Pending", lastUpdated: hoursAgo(1) }),
  ], NOW);
  const types = notifications.map((n) => n.type);
  assert.ok(types.includes("voice_review"));
  assert.ok(!types.includes("voice_completed"));
});

test("a completed voice interview already decided is voice_completed", () => {
  const notifications = deriveNotifications([
    row({ voiceStatus: "Interviewed", voiceHrDecision: "approve", lastUpdated: hoursAgo(1) }),
  ], NOW);
  assert.ok(notifications.some((n) => n.type === "voice_completed"));
  assert.ok(!notifications.some((n) => n.type === "voice_review"));
});

test("a scheduled final interview produces final_booked", () => {
  const notifications = deriveNotifications([
    row({ finalScheduledDate: hoursAgo(3), lastUpdated: hoursAgo(3) }),
  ], NOW);
  assert.ok(notifications.some((n) => n.type === "final_booked"));
});

test("newest notifications sort first and the list is capped", () => {
  const rows = Array.from({ length: MAX_NOTIFICATIONS + 20 }, (_, index) => row({
    applicationId: `APP-${index}`,
    dateOfApplication: hoursAgo(index + 1),
    lastUpdated: hoursAgo(index + 1),
  }));
  const notifications = deriveNotifications(rows, NOW);
  assert.equal(notifications.length, MAX_NOTIFICATIONS);
  const times = notifications.map((n) => Date.parse(n.timestamp));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test("read state: mark-all covers everything older than its timestamp; ids cover individual items", () => {
  const notifications = deriveNotifications([
    row({ applicationId: "APP-A", dateOfApplication: hoursAgo(5), lastUpdated: hoursAgo(5) }),
    row({ applicationId: "APP-B", dateOfApplication: hoursAgo(1), lastUpdated: hoursAgo(1) }),
  ], NOW);

  const afterAll = applyReadState(notifications, withAllNotificationsRead(NOW));
  assert.equal(afterAll.unreadCount, 0);
  assert.ok(afterAll.notifications.every((n) => n.read));

  const oneRead = withNotificationRead(emptyReadState(), "applicant_new:APP-A");
  const afterOne = applyReadState(notifications, oneRead);
  assert.equal(afterOne.unreadCount, 1);
  assert.equal(afterOne.notifications.find((n) => n.id === "applicant_new:APP-A").read, true);
  assert.equal(afterOne.notifications.find((n) => n.id === "applicant_new:APP-B").read, false);
});

test("a notification newer than the last mark-all becomes unread again", () => {
  const stale = deriveNotifications([row({ applicationId: "APP-X", dateOfApplication: hoursAgo(10), lastUpdated: hoursAgo(10) })], NOW);
  const markedAt = new Date(NOW.getTime() - 5 * 3600_000); // 5h ago
  assert.equal(applyReadState(stale, withAllNotificationsRead(markedAt)).unreadCount, 0);

  const fresh = deriveNotifications([row({ applicationId: "APP-X", dateOfApplication: hoursAgo(1), lastUpdated: hoursAgo(1) })], NOW);
  assert.equal(applyReadState(fresh, withAllNotificationsRead(markedAt)).unreadCount, 1);
});

test("access control: a confidential-department applicant is filtered out before notifications are built", () => {
  const rows = [
    row({ applicationId: "APP-AI", candidateName: "Confidential Person", department: "AI" }),
    row({ applicationId: "APP-SALES", candidateName: "Open Person", department: "Sales" }),
  ];
  const hrOutsideAi = {
    email: "hr@mclinkgroup.com", department: "HR",
    canCreateRole: false, canReviewRole: true, canApproveRole: false, canReviewDepartmentRole: false,
  };
  const visible = filterVisibleApplicants(rows, hrOutsideAi);
  const notifications = deriveNotifications(visible, NOW);
  assert.ok(notifications.every((n) => n.applicationId !== "APP-AI"));
  assert.ok(notifications.some((n) => n.applicationId === "APP-SALES"));
});
