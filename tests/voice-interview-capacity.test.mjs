import assert from "node:assert/strict";
import test from "node:test";

import {
  canAcceptVoiceInterview,
  countActiveVoiceInterviews,
  MAX_CONCURRENT_VOICE_INTERVIEWS,
  voiceInterviewConcurrencyKey,
} from "../src/lib/voice-interview-capacity.ts";

const slot = { date: "2026-08-27", startTime: "10:00", endTime: "10:10", timezone: "Asia/Singapore" };

function bookedRows(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    ...slot,
    interviewType: "AI Voice Interview",
    status: "Booked",
    applicationId: `APP-${index}`,
    ...overrides,
  }));
}

test("voice interview capacity allows the tenth applicant but not an eleventh", () => {
  assert.equal(MAX_CONCURRENT_VOICE_INTERVIEWS, 10);
  assert.equal(countActiveVoiceInterviews(bookedRows(9), slot), 9);
  assert.equal(canAcceptVoiceInterview(bookedRows(9), slot), true);
  assert.equal(countActiveVoiceInterviews(bookedRows(10), slot), 10);
  assert.equal(canAcceptVoiceInterview(bookedRows(10), slot), false);
});

test("voice capacity counts only the same time and active appointments", () => {
  const rows = [
    ...bookedRows(3),
    ...bookedRows(2, { startTime: "10:10", endTime: "10:20" }),
    ...bookedRows(2, { status: "Completed" }),
  ];
  assert.equal(countActiveVoiceInterviews(rows, slot), 3);
});

test("voice capacity groups equivalent instants across timezones", () => {
  const singaporeSlot = slot;
  const utcSlot = { date: "2026-08-27", startTime: "02:00", endTime: "02:10", timezone: "UTC" };
  assert.equal(voiceInterviewConcurrencyKey(singaporeSlot), voiceInterviewConcurrencyKey(utcSlot));
  assert.equal(countActiveVoiceInterviews(bookedRows(10, utcSlot), singaporeSlot), 10);
});
