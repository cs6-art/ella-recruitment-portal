import assert from "node:assert/strict";
import test from "node:test";

import { demoCutoffMs, isDemoSideEffectAllowed, isDemoWindowRecord } from "../src/lib/demo-mode.ts";

const originalDemoMode = process.env.DEMO_MODE;
const originalDemoCutoff = process.env.DEMO_CUTOFF;

test.after(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
  if (originalDemoCutoff === undefined) delete process.env.DEMO_CUTOFF;
  else process.env.DEMO_CUTOFF = originalDemoCutoff;
});

test("August 20 is the fixed inclusive baseline on future days", () => {
  process.env.DEMO_MODE = "true";
  delete process.env.DEMO_CUTOFF;

  assert.equal(demoCutoffMs(), Date.parse("2026-08-20T00:00:00+08:00"));
  assert.equal(isDemoWindowRecord("2026-08-19T23:59:59+08:00"), false);
  assert.equal(isDemoWindowRecord("2026-08-20T00:00:00+08:00"), true);
  assert.equal(isDemoWindowRecord("2026-08-21T09:00:00+08:00"), true);
  assert.equal(isDemoSideEffectAllowed("2026-08-20T00:00:00+08:00"), true);
});

test("disabling demo mode leaves normal production records unrestricted", () => {
  process.env.DEMO_MODE = "false";
  delete process.env.DEMO_CUTOFF;
  assert.equal(isDemoSideEffectAllowed("2025-01-01T00:00:00Z"), true);
});
