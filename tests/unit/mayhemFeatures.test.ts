import { describe, expect, test } from "vitest";
import * as THREE from "three";
import type { ArcadeMissionFields } from "../../src/levels";
import type { ScoreBreakdown, ScoreEvent } from "../../src/scoring";
import {
  DAILY_RESULTS_STORAGE_KEY,
  dailyContractForDate,
  loadDailyResult,
  mayhemContractForRun,
  recordDailyResult,
  replayMomentFromEvents,
  runFeedbackForScore,
  runVariantForSeed,
  summarizeScoreSources
} from "../../src/mayhemFeatures";

const MISSION: ArcadeMissionFields = {
  arc: "object-destruction",
  order: 1,
  targetZone: "hazard-core",
  scoreThresholds: {
    oneStar: 75_000,
    twoStar: 145_000,
    threeStar: 220_000
  },
  targetDamageThreshold: 30_000,
  bonusThreshold: { metric: "chainReactionCount", minimum: 180 },
  bonusObjective: "Sustain secondary hits.",
  briefingHint: "Aim at named setpieces."
};

describe("mayhem feature helpers", () => {
  test("builds deterministic variant contracts for the current projectile", () => {
    const variant = runVariantForSeed("hazard-junction", 12345);
    const contract = mayhemContractForRun("hazard-junction", MISSION, "scatter", variant);

    expect(runVariantForSeed("hazard-junction", 12345)).toEqual(variant);
    expect(contract.label).toContain(variant.label);
    expect(contract.objectives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "scatter-secondary-hits", metric: "chainReactionCount" }),
        expect.objectContaining({ id: `${variant.id}-district-contract` })
      ])
    );
  });

  test("builds a deterministic daily contract from the UTC date", () => {
    const levels = [
      { id: "hazard-junction", mission: MISSION },
      { id: "breaker-yard", mission: { ...MISSION, order: 2, targetZone: "breaker-spine" } }
    ];
    const first = dailyContractForDate(levels, new Date("2026-06-30T22:30:00.000Z"));
    const second = dailyContractForDate(levels, new Date("2026-06-30T01:15:00.000Z"));
    const nextDay = dailyContractForDate(levels, new Date("2026-07-01T01:15:00.000Z"));

    expect(first).toEqual(second);
    expect(first?.dateKey).toBe("2026-06-30");
    expect(first?.contract.objectives).toHaveLength(2);
    expect(nextDay?.dateKey).toBe("2026-07-01");
  });

  test("summarizes score sources and chooses a replay moment", () => {
    const events: ScoreEvent[] = [
      event("target", "TARGET BREAK", 420),
      event("target", "TARGET HIT", 180),
      event("chain", "CHAIN x8", 260, 8),
      event("chaos", "GLASS POP", 95)
    ];

    expect(summarizeScoreSources(events, 2)).toEqual([
      { kind: "target", label: "Target damage", points: 600 },
      { kind: "chain", label: "Secondary chain", points: 260 }
    ]);
    expect(replayMomentFromEvents(events)).toEqual({
      label: "CHAIN x8 combo",
      points: 260
    });
  });

  test("records daily best results without overwriting them with weaker runs", () => {
    const levels = [{ id: "hazard-junction", mission: MISSION }];
    const daily = dailyContractForDate(levels, new Date("2026-06-30T22:30:00.000Z"));
    const storage = memoryStorage();

    expect(daily).not.toBeNull();
    if (!daily) {
      return;
    }

    const first = recordDailyResult(
      daily,
      {
        score: score({ totalScore: 150_000, mayhemRating: "DISTRICT WRECKER" }),
        stars: 2,
        contractCompleted: false,
        levelName: "Hazard Junction",
        projectileLabel: "Frag"
      },
      storage
    );
    const second = recordDailyResult(
      daily,
      {
        score: score({ totalScore: 120_000, mayhemRating: "SPARK SHOW" }),
        stars: 1,
        contractCompleted: true,
        levelName: "Hazard Junction",
        projectileLabel: "Frag"
      },
      storage
    );

    expect(first).toMatchObject({
      attempts: 1,
      previousBestScore: 0,
      bestScore: 150_000,
      bestStars: 2,
      newBest: true,
      starsGained: 2
    });
    expect(first.shareText).toContain("Downtown Mayhem Daily 2026-06-30 / 150,000 Mayhem / 2/3 stars");
    expect(second).toMatchObject({
      attempts: 2,
      previousBestScore: 150_000,
      bestScore: 150_000,
      bestStars: 2,
      newBest: false,
      contractCompleted: true
    });
    expect(loadDailyResult(daily, storage)).toMatchObject({
      attempts: 2,
      bestScore: 150_000,
      bestStars: 2,
      bestContractCompleted: true
    });
    expect(JSON.parse(storage.getItem(DAILY_RESULTS_STORAGE_KEY) ?? "{}")).toMatchObject({
      version: 1
    });
  });

  test("keeps daily best entries isolated by contract identity and handles blocked storage", () => {
    const levels = [{ id: "hazard-junction", mission: MISSION }];
    const first = dailyContractForDate(levels, new Date("2026-06-30T22:30:00.000Z"));
    const second = dailyContractForDate(levels, new Date("2026-07-01T22:30:00.000Z"));
    const storage = memoryStorage();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) {
      return;
    }

    recordDailyResult(
      first,
      {
        score: score({ totalScore: 111_000 }),
        stars: 1,
        contractCompleted: false,
        levelName: "Hazard Junction",
        projectileLabel: "Normal"
      },
      storage
    );

    expect(loadDailyResult(first, storage)?.bestScore).toBe(111_000);
    expect(loadDailyResult(second, storage)).toBeNull();
    expect(loadDailyResult(first, null)).toBeNull();
    expect(
      recordDailyResult(
        first,
        {
          score: score({ totalScore: 222_000 }),
          stars: 3,
          contractCompleted: true,
          levelName: "Hazard Junction",
          projectileLabel: "Normal"
        },
        throwingStorage()
      )
    ).toMatchObject({
      attempts: 1,
      bestScore: 222_000,
      newBest: true
    });
  });

  test("returns actionable retry feedback for near misses", () => {
    const variant = runVariantForSeed("hazard-junction", 12345);
    const contract = mayhemContractForRun("hazard-junction", MISSION, "pulse", variant);
    const feedback = runFeedbackForScore({
      score: score({ totalScore: 130_000, targetDamage: 24_000, chainReactionCount: 120 }),
      mission: MISSION,
      variant,
      contract,
      contractResult: {
        completed: false,
        objectives: [{ id: "district", label: "District contract", completed: false, value: 120, target: 140 }]
      },
      topSources: [{ kind: "chain", label: "Secondary chain", points: 22_000 }],
      replayMoment: { label: "CHAIN x120 combo", points: 900 },
      projectileId: "pulse"
    });

    expect(feedback.nearMisses).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Retry route:"),
        expect.stringContaining("Aim plan:"),
        expect.stringContaining("Bonus route:")
      ])
    );
    expect(feedback.nearMisses[0]).toContain("Impulse Orb");
    expect(feedback.nearMisses[1]).toContain("target core");
    expect(feedback.projectileObjective?.id).toBe("pulse-chaos-wave");
  });
});

function event(kind: ScoreEvent["kind"], label: string, points: number, combo?: number): ScoreEvent {
  return {
    kind,
    label,
    points,
    combo,
    position: new THREE.Vector3()
  };
}

function score(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    targetDamage: 0,
    collateralChaos: 0,
    chainReactionBonus: 0,
    remainingDebrisMotion: 0,
    weakPointBreakCount: 0,
    bossBreakCount: 0,
    damageHotspots: [],
    mayhemRating: "SPARK SHOW",
    totalScore: 0,
    shotName: "Test Shot",
    chainReactionCount: 0,
    maxChainCombo: 0,
    ...overrides
  };
}

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

function throwingStorage(): Pick<Storage, "getItem" | "setItem"> {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    }
  };
}
