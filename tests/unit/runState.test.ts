import { describe, expect, test } from "vitest";
import { ShotRunState } from "../../src/runState";
import type { ScoreBreakdown } from "../../src/scoring";

describe("ShotRunState", () => {
  test("waits for settle before the force-score timeout", () => {
    const runState = new ShotRunState();
    runState.beginFlight();
    runState.beginSpectacle(1_000);

    expect(runState.evaluateScoreReveal(3_700, false)).toBe("waiting");
    expect(runState.evaluateScoreReveal(10_000, false)).toBe("waiting");
  });

  test("forces score reveal when motion never settles", () => {
    const runState = new ShotRunState();
    runState.beginFlight();
    runState.beginSpectacle(1_000);

    expect(runState.evaluateScoreReveal(15_000, false)).toBe("ready");
  });

  test("reveals the score only after consecutive settled frames", () => {
    const runState = new ShotRunState();
    runState.beginFlight();
    runState.beginSpectacle(1_000);

    for (let frame = 0; frame < 17; frame += 1) {
      expect(runState.evaluateScoreReveal(4_000 + frame, true)).toBe("waiting");
    }

    expect(runState.evaluateScoreReveal(4_020, true)).toBe("ready");
  });

  test("stops score reveal checks after the score is locked", () => {
    const runState = new ShotRunState();
    runState.beginFlight();
    runState.beginSpectacle(1_000);

    runState.markScored(fakeScore());

    expect(runState.phase).toBe("scored");
    expect(runState.evaluateScoreReveal(120_000, true)).toBe("inactive");
  });
});

function fakeScore(): ScoreBreakdown {
  return {
    shotName: "Test Shot",
    targetDamage: 0,
    collateralChaos: 0,
    chainReactionBonus: 0,
    chainReactionCount: 0,
    maxChainCombo: 0,
    remainingDebrisMotion: 0,
    totalScore: 0,
    mayhemRating: "TEST"
  };
}
