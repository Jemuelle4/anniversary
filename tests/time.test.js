import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayKey, diffDays, hourIn, isoWeek, relativeTime, ritualDayKey, safeTz } from "../src/game/time.js";

test("dayKey and hourIn respect the timezone", () => {
  const t = Date.parse("2026-09-18T23:30:00Z");
  assert.equal(dayKey(t, "UTC"), "2026-09-18");
  assert.equal(dayKey(t, "Asia/Manila"), "2026-09-19");
  assert.equal(hourIn(t, "Asia/Manila"), 7);
  assert.equal(dayKey(t, "America/Los_Angeles"), "2026-09-18");
  assert.equal(hourIn(t, "America/Los_Angeles"), 16);
});

test("ritual day rolls over at 03:00 local", () => {
  const t = Date.parse("2026-09-19T01:00:00Z");
  assert.equal(ritualDayKey(t, "UTC"), "2026-09-18");
  assert.equal(ritualDayKey(Date.parse("2026-09-19T03:00:00Z"), "UTC"), "2026-09-19");
});

test("DST boundary in Los Angeles keeps day keys sane", () => {
  const before = Date.parse("2026-03-08T09:30:00Z"); // 01:30 PST
  const after = Date.parse("2026-03-08T10:30:00Z");  // 03:30 PDT
  assert.equal(hourIn(before, "America/Los_Angeles"), 1);
  assert.equal(hourIn(after, "America/Los_Angeles"), 3);
  assert.equal(dayKey(after, "America/Los_Angeles"), "2026-03-08");
});

test("addDays, diffDays, isoWeek", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(diffDays("2026-09-01", "2026-09-18"), 17);
  assert.equal(isoWeek("2026-01-01"), "2026-W01");
  assert.equal(isoWeek("2027-01-01"), "2026-W53");
  assert.equal(isoWeek("2026-09-14"), isoWeek("2026-09-20"));
  assert.notEqual(isoWeek("2026-09-20"), isoWeek("2026-09-21"));
});

test("relativeTime and safeTz", () => {
  assert.equal(relativeTime(0, 10_000), "just now");
  assert.equal(relativeTime(0, 5 * 60_000), "5m ago");
  assert.equal(relativeTime(0, 2 * 3_600_000), "2h ago");
  assert.equal(relativeTime(0, 3 * 86_400_000), "3d ago");
  assert.equal(safeTz("Not/AZone"), "UTC");
});
