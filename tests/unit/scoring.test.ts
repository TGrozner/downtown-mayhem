import { describe, expect, test } from "vitest";
import * as THREE from "three";
import type { ExplosionAffectedObject, ExplosionResult } from "../../src/destruction";
import type { PhysicsWorld } from "../../src/physics";
import {
  IGNITE_UNLOCK_LEVEL_COUNT,
  LATE_GAME_PROJECTILE_ORDER,
  PROJECTILE_ORDER,
  PROJECTILES,
  projectileOrderForUnlockedLevels
} from "../../src/projectile";
import { ShotScoreTracker } from "../../src/scoring";

describe("ShotScoreTracker", () => {
  test("exposes exactly four player projectile choices on keys one through four", () => {
    expect(PROJECTILE_ORDER).toEqual(["slug", "scatter", "pulse", "gravity"]);
    expect(PROJECTILE_ORDER.map((id) => PROJECTILES[id].key)).toEqual(["1", "2", "3", "4"]);
    expect(PROJECTILE_ORDER.map((id) => PROJECTILES[id].shortName)).toEqual(["Normal", "Frag", "Impulse", "Heavy"]);
    expect(PROJECTILE_ORDER.map((id) => PROJECTILES[id].role)).toEqual([
      "Classic fireball",
      "Shrapnel pops",
      "Cyan shockwave",
      "Purple crush"
    ]);
  });

  test("exposes Ignite only through the late-game projectile order", () => {
    expect(IGNITE_UNLOCK_LEVEL_COUNT).toBe(5);
    expect(projectileOrderForUnlockedLevels(4)).toEqual(PROJECTILE_ORDER);
    expect(projectileOrderForUnlockedLevels(5)).toEqual(LATE_GAME_PROJECTILE_ORDER);
    expect(LATE_GAME_PROJECTILE_ORDER).toEqual(["slug", "scatter", "pulse", "gravity", "ignite"]);
    expect(PROJECTILES.ignite).toMatchObject({
      key: "5",
      name: "Ignite Lattice",
      shortName: "Ignite",
      role: "Sci-fi ignition"
    });
  });

  test("keeps Impulse stable while buffing Normal, Frag, and Heavy identities", () => {
    expect(PROJECTILES.pulse).toMatchObject({
      impulse: 74,
      blastRadius: 7.8,
      fractureBoost: 0.72,
      scoreModifier: 1.12
    });

    expect(PROJECTILES.slug).toMatchObject({
      impulse: 64,
      blastRadius: 3.75,
      fractureBoost: 1.38,
      scoreModifier: 1.08
    });
    expect(PROJECTILES.scatter).toMatchObject({
      impulse: 44,
      blastRadius: 3.05,
      fractureBoost: 0.98,
      scoreModifier: 1.22
    });
    expect(PROJECTILES.gravity).toMatchObject({
      baseRadius: 0.42,
      density: 10.2,
      speed: 34,
      scoreModifier: 1.25
    });
  });

  test("deduplicates object damage while emitting high-value collateral chaos events", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    const events = tracker.addExplosion(
      result({
        materialChaos: 96,
        affectedObjects: [
          affectedObject({ id: 1, scoreRole: "target", weightedDamage: 100, fractured: true }),
          affectedObject({ id: 2, scoreRole: "neutral", weightedDamage: 40, fractured: false })
        ]
      })
    );

    expect(events.map((event) => [event.kind, event.label, event.points])).toEqual([
      ["target", "TARGET BREAK", 110],
      ["chaos", "COLLATERAL SURGE", 96]
    ]);

    expect(
      tracker.addExplosion(
        result({
          affectedObjects: [affectedObject({ id: 1, scoreRole: "target", weightedDamage: 80, fractured: true })]
        })
      )
    ).toEqual([]);

    expect(
      tracker.addExplosion(
        result({
          affectedObjects: [affectedObject({ id: 1, scoreRole: "target", weightedDamage: 130, fractured: true })]
        })
      ).map((event) => event.points)
    ).toEqual([33]);
  });

  test("applies chain combo scaling and projectile score modifiers", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0))[0]).toMatchObject({
      kind: "chain",
      label: "CHAIN START",
      points: 100,
      combo: 1
    });
    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0))[0]).toMatchObject({
      label: "CHAIN x2",
      points: 112,
      combo: 2
    });
    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0))[0]).toMatchObject({
      label: "CASCADE x3",
      points: 124,
      combo: 3
    });
    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0))[0]).toMatchObject({
      label: "MAYHEM COMBO x4",
      points: 115,
      combo: 4
    });
    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0), "POWER RELAY BLAST")[0]).toMatchObject({
      label: "POWER RELAY BLAST x5",
      points: 109,
      combo: 5
    });

    expect(tracker.finalize(fakePhysics([]))).toMatchObject({
      chainReactionBonus: 605,
      chainReactionCount: 5,
      maxChainCombo: 5,
      totalScore: 605
    });
  });

  test("previews the running score without adding unsettled motion bonus", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.scatter);
    tracker.addExplosion(
      result({
        materialChaos: 1_000,
        affectedObjects: [affectedObject({ id: 1, scoreRole: "target", weightedDamage: 500, fractured: true })]
      })
    );
    tracker.addChainReaction(250, new THREE.Vector3(0, 0, 0));

    expect(tracker.preview()).toMatchObject({
      targetDamage: 671,
      collateralChaos: 1220,
      chainReactionBonus: 305,
      remainingDebrisMotion: 0,
      totalScore: 2196
    });
  });

  test("scores remaining motion only for non-projectile bodies", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    expect(
      tracker.finalize(
        fakePhysics([
          { category: "debris", scoreRole: "neutral", isDebris: true, velocity: { x: 10, y: 0, z: 0 } },
          { category: "structure", scoreRole: "target", isDebris: false, velocity: { x: 20, y: 0, z: 0 } },
          { category: "projectile", scoreRole: "neutral", isDebris: false, velocity: { x: 100, y: 0, z: 0 } },
          { category: "structure", scoreRole: "neutral", isDebris: false, velocity: { x: 100, y: 0, z: 0 } }
        ])
      )
    ).toMatchObject({
      remainingDebrisMotion: 202,
      totalScore: 202
    });
  });

  test("keeps mayhem ratings on the calibrated district score scale", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    tracker.addExplosion(result({ materialChaos: 405_000 }));

    expect(tracker.finalize(fakePhysics([]))).toMatchObject({
      totalScore: 437_400,
      mayhemRating: "CITY WRECKER"
    });
  });

  test("caps oversized chain events while keeping combo readable", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    expect(tracker.addChainReaction(50_000, new THREE.Vector3(0, 0, 0), "GAS LINE BLAST")[0]).toMatchObject({
      label: "GAS LINE BLAST",
      points: 900,
      combo: 1
    });
    expect(tracker.addChainReaction(50_000, new THREE.Vector3(0, 0, 0), "GAS LINE BLAST")[0]).toMatchObject({
      label: "GAS LINE BLAST x2",
      points: 1008,
      combo: 2
    });
  });

  test("highlights weak point and boss breaks while aggregating readable damage hotspots", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    const events = tracker.addExplosion(
      result({
        affectedObjects: [
          affectedObject({
            id: 11,
            label: "Breaker boss shear pin",
            zoneId: "breaker-boss weak-point",
            scoreRole: "target",
            weightedDamage: 100,
            fractured: true
          }),
          affectedObject({
            id: 12,
            label: "Archive boss prism lens",
            zoneId: "archive-boss glass-depot",
            materialId: "glass",
            scoreRole: "target",
            weightedDamage: 80,
            fractured: true
          })
        ]
      })
    );

    expect(events.map((event) => event.label)).toEqual(["SHEAR PIN BREAK", "BOSS BREAK"]);
    expect(tracker.finalize(fakePhysics([]))).toMatchObject({
      weakPointBreakCount: 1,
      bossBreakCount: 2,
      damageHotspots: [
        { label: "Breaker boss", targetDamage: 119, points: 119, hits: 1 },
        { label: "Archive boss", targetDamage: 95, points: 95, hits: 1 }
      ]
    });
  });

  test("ranks damage hotspots by real target damage and allocated collateral chaos", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);
    tracker.addExplosion(
      result({
        materialChaos: 10_000,
        affectedObjects: [
          affectedObject({
            id: 1,
            label: "Gas station canopy",
            zoneId: "gas-station canopy",
            scoreRole: "target",
            weightedDamage: 4_000,
            fractured: true
          }),
          affectedObject({
            id: 2,
            label: "Gas line conduit",
            zoneId: "gas-station gas-line",
            scoreRole: "neutral",
            weightedDamage: 1_000,
            fractured: true
          }),
          affectedObject({
            id: 3,
            label: "Elevated metro guideway",
            zoneId: "elevated-metro transit-spine",
            scoreRole: "neutral",
            weightedDamage: 5_000,
            fractured: true
          })
        ]
      })
    );

    expect(tracker.finalize(fakePhysics([]))).toMatchObject({
      targetDamage: 4752,
      collateralChaos: 10800,
      totalScore: 15552,
      damageHotspots: [
        { label: "Gas station", points: 10152, targetDamage: 4752, collateralDamage: 5400, hits: 2 },
        { label: "Elevated metro", points: 5400, targetDamage: 0, collateralDamage: 5400, hits: 1 }
      ]
    });
  });
});

function result(overrides: Partial<ExplosionResult> = {}): ExplosionResult {
  return {
    origin: new THREE.Vector3(1, 0, 2),
    affectedBodies: overrides.affectedObjects?.length ?? 0,
    fracturedBodies: 0,
    dustColors: [],
    affectedObjects: [],
    structureDamage: 0,
    materialChaos: 0,
    ...overrides
  };
}

function affectedObject(overrides: Partial<ExplosionAffectedObject> = {}): ExplosionAffectedObject {
  return {
    id: 1,
    label: "test object",
    materialId: "concrete",
    category: "structure",
    scoreRole: "target",
    position: new THREE.Vector3(0, 0, 0),
    energy: 20,
    weightedDamage: 100,
    scoreValue: 100,
    fractured: true,
    ...overrides
  };
}

function fakePhysics(
  objects: Array<{
    category: string;
    scoreRole: string;
    isDebris: boolean;
    velocity: { x: number; y: number; z: number };
  }>
): PhysicsWorld {
  return {
    getDynamicObjects: () =>
      objects.map((object) => ({
        category: object.category,
        scoreRole: object.scoreRole,
        isDebris: object.isDebris,
        body: {
          linvel: () => object.velocity
        }
      }))
  } as unknown as PhysicsWorld;
}
