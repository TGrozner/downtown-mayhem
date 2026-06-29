import { describe, expect, test } from "vitest";
import type { ArcadeMissionFields } from "../../src/levels";
import { mayhemContractForRun, runVariantForSeed } from "../../src/mayhemFeatures";

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

});
