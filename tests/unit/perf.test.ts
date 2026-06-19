import { describe, expect, test } from "vitest";
import { shouldEnablePerfFromSearch } from "../../src/perf";

describe("perf monitor query flags", () => {
  test("enables perf monitoring for full reports even without the short perf flag", () => {
    expect(shouldEnablePerfFromSearch("?perfFull")).toBe(true);
    expect(shouldEnablePerfFromSearch("?smoke=1&perfFull=1")).toBe(true);
    expect(shouldEnablePerfFromSearch("?perf=1")).toBe(true);
    expect(shouldEnablePerfFromSearch("?smoke=1")).toBe(false);
  });
});
