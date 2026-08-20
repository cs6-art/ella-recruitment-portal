import assert from "node:assert/strict";
import test from "node:test";

function historyPair(previousStatus, newStatus) {
  return { previousStatus, newStatus };
}

test("candidate history records the previous and new status pair", () => {
  const entry = historyPair("Pending HR Discussion", "Approved for AI Voice Interview");
  assert.equal(entry.previousStatus, "Pending HR Discussion");
  assert.equal(entry.newStatus, "Approved for AI Voice Interview");
});
