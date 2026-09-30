import { test } from "node:test";
import assert from "node:assert/strict";
import { weekCutoff } from "../f/kaneo/plan_week.ts";

const SGT = "Asia/Singapore";
const cutoff = (iso: string, tz = SGT) => weekCutoff(new Date(iso), tz).toISOString();

test("midweek run reaches Friday of the following week", () => {
  // Thu 1 Oct 00:00 SGT -> Sat 10 Oct 00:00 SGT
  assert.equal(cutoff("2026-09-30T16:00:00Z"), "2026-10-09T16:00:00.000Z");
});

test("Sunday still belongs to the current week", () => {
  // Sun 4 Oct 00:00 SGT -> Sat 10 Oct 00:00 SGT
  assert.equal(cutoff("2026-10-03T16:00:00Z"), "2026-10-09T16:00:00.000Z");
});

test("Monday rolls the cutoff forward a week", () => {
  // Mon 5 Oct 00:00 SGT -> Sat 17 Oct 00:00 SGT
  assert.equal(cutoff("2026-10-04T16:00:00Z"), "2026-10-16T16:00:00.000Z");
});

test("the run date is taken in the given timezone, not UTC", () => {
  // Sun 4 Oct 23:30 UTC is already Mon 5 Oct in Singapore.
  assert.equal(cutoff("2026-10-04T23:30:00Z"), "2026-10-16T16:00:00.000Z");
  assert.equal(cutoff("2026-10-04T23:30:00Z", "UTC"), "2026-10-10T00:00:00.000Z");
});

test("month and DST boundaries land on local midnight", () => {
  // Thu 29 Oct 2026 in New York, cutoff Sat 7 Nov after the 1 Nov switch to EST (UTC-5).
  assert.equal(cutoff("2026-10-29T12:00:00Z", "America/New_York"), "2026-11-07T05:00:00.000Z");
});
