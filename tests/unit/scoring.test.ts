import { describe, expect, test } from "vitest";
import * as THREE from "three";
import type { ExplosionAffectedObject, ExplosionResult } from "../../src/destruction";
import type { PhysicsWorld } from "../../src/physics";
import { PROJECTILES } from "../../src/projectile";
import { ShotScoreTracker } from "../../src/scoring";

describe("ShotScoreTracker", () => {
  test("deduplicates target and protected object damage while emitting high-value events", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    const events = tracker.addExplosion(
      result({
        materialChaos: 96,
        bioGelSplash: 40,
        affectedObjects: [
          affectedObject({ id: 1, scoreRole: "target", weightedDamage: 100, fractured: true }),
          affectedObject({ id: 2, scoreRole: "protected", weightedDamage: 40, fractured: false })
        ]
      }),
      7
    );

    expect(events.map((event) => [event.kind, event.label, event.points])).toEqual([
      ["target", "TARGET", 110],
      ["protected", "PROTECTED", -40],
      ["purge", "PURGE", 47],
      ["chaos", "CHAOS", 96]
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
      label: "CHAIN",
      points: 100,
      combo: 1
    });
    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0))[0]).toMatchObject({
      label: "CHAIN x2",
      points: 142,
      combo: 2
    });
    expect(tracker.addChainReaction(100, new THREE.Vector3(0, 0, 0))[0]).toMatchObject({
      label: "CASCADE x3",
      points: 184,
      combo: 3
    });

    expect(tracker.finalize(fakePhysics([]))).toMatchObject({
      chainReactionBonus: 447,
      chainReactionCount: 3,
      maxChainCombo: 3,
      totalScore: 447
    });
  });

  test("scores remaining motion only for non-protected, non-projectile bodies", () => {
    const tracker = new ShotScoreTracker();
    tracker.beginShot(PROJECTILES.slug);

    expect(
      tracker.finalize(
        fakePhysics([
          { category: "debris", scoreRole: "neutral", isDebris: true, velocity: { x: 10, y: 0, z: 0 } },
          { category: "structure", scoreRole: "target", isDebris: false, velocity: { x: 20, y: 0, z: 0 } },
          { category: "projectile", scoreRole: "neutral", isDebris: false, velocity: { x: 100, y: 0, z: 0 } },
          { category: "structure", scoreRole: "protected", isDebris: false, velocity: { x: 100, y: 0, z: 0 } }
        ])
      )
    ).toMatchObject({
      remainingDebrisMotion: 112,
      totalScore: 112
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
    bioGelSplash: 0,
    protectedPenalty: 0,
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
