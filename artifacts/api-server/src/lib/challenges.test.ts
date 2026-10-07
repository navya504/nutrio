import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, challengeProgress, indiaDate } from "./challenges";

const member = {
  id: 1, ownerId: "unit-test-owner", challengeSlug: "colourful-plate",
  startDate: "2026-10-07", isActive: true,
};
test("India calendar day changes at 18:30 UTC, not UTC midnight", () => {
  assert.equal(indiaDate(new Date("2026-10-07T18:29:59Z")), "2026-10-07");
  assert.equal(indiaDate(new Date("2026-10-07T18:30:00Z")), "2026-10-08");
});
test("Calendar arithmetic handles leap days and month boundaries", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("A challenge has exactly 21 inclusive days and no next-day check-in", () => {
  const last = challengeProgress(member, [], "2026-10-27");
  assert.equal(last.endDate, "2026-10-27");
  assert.equal(last.dayNumber, 21);
  assert.equal(last.canCheckIn, true);
  const expired = challengeProgress(member, [], "2026-10-28");
  assert.equal(expired.isFinished, true);
  assert.equal(expired.canCheckIn, false);
});
test("Completion on the last day still allows undo of today's check-in", () => {
  const dates = Array.from({ length: 21 }, (_, i) => addDays(member.startDate, i));
  const completed = challengeProgress(member, dates, dates[20]);
  assert.equal(completed.isFinished, true);
  assert.equal(completed.completedDays, 21);
  assert.equal(completed.streak, 21);
  assert.equal(completed.canCheckIn, true);
  const undone = challengeProgress(member, dates.slice(0, 20), dates[20]);
  assert.equal(undone.isFinished, false);
  assert.equal(undone.completedDays, 20);
});
test("Repeated dates count once; leaving keeps dates but prevents check-ins", () => {
  const progress = challengeProgress({ ...member, isActive: false }, ["2026-10-07", "2026-10-07"], "2026-10-07");
  assert.equal(progress.completedDays, 1);
  assert.equal(progress.canCheckIn, false);
  assert.deepEqual(progress.checkedDates, ["2026-10-07"]);
  assert.equal(progress.startDate, member.startDate);
});
test("Current streak allows today's action to be pending but breaks at a missed day", () => {
  assert.equal(challengeProgress(member, ["2026-10-07", "2026-10-08"], "2026-10-09").streak, 2);
  assert.equal(challengeProgress(member, ["2026-10-07"], "2026-10-09").streak, 0);
});
