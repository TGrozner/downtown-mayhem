import * as THREE from "three";
import { beforeAll, describe, expect, test } from "vitest";
import { DestructionSystem } from "../../src/destruction";
import type { MaterialCatalog, MaterialDefinition, MaterialId } from "../../src/materialCatalog";
import { PhysicsWorld } from "../../src/physics";
import { initializeRapierCompat } from "../../src/rapierInit";

const metal: MaterialDefinition = {
  id: "metal",
  name: "Metal",
  key: "4",
  color: new THREE.Color(0x3a4652),
  dustColor: new THREE.Color(0x8ca3b5),
  density: 4.2,
  massFactor: 4.2,
  friction: 0.54,
  restitution: 0.12,
  fractureThreshold: 66,
  fragmentCount: [5, 9],
  angularResponse: 1.75,
  fragmentLife: 30,
  description: "test metal"
};

const concrete: MaterialDefinition = {
  id: "concrete",
  name: "Concrete",
  key: "3",
  color: new THREE.Color(0x6f736d),
  dustColor: new THREE.Color(0x928f84),
  density: 2.2,
  massFactor: 2.75,
  friction: 0.92,
  restitution: 0.08,
  fractureThreshold: 50,
  fragmentCount: [10, 18],
  angularResponse: 0.62,
  fragmentLife: 28,
  description: "test concrete"
};

const testMaterials = {
  order: ["concrete", "metal"] satisfies MaterialId[],
  get(id: MaterialId): MaterialDefinition {
    if (id === "metal") {
      return metal;
    }
    if (id === "concrete") {
      return concrete;
    }
    throw new Error(`Unexpected material in impact test: ${id}`);
  },
  getRenderMaterial(): THREE.Material {
    return new THREE.MeshBasicMaterial();
  }
} as unknown as MaterialCatalog;

describe("support release triggers", () => {
  beforeAll(async () => {
    await initializeRapierCompat();
  });

  test("can release support objects below a high weak point", () => {
    const physics = new PhysicsWorld(new THREE.Scene());
    const renderMaterial = new THREE.MeshBasicMaterial();
    const support = physics.addDynamicBox({
      label: "lower crane support",
      material: metal,
      renderMaterial,
      position: new THREE.Vector3(0, 5, 0),
      size: new THREE.Vector3(1, 10, 1),
      category: "structure",
      supportGroupId: "crane-test",
      destructible: false,
      canFracture: false,
      bodyType: "fixed"
    });
    const weakPoint = physics.addDynamicBox({
      label: "upper crane weak point",
      material: metal,
      renderMaterial,
      position: new THREE.Vector3(0, 12, 0),
      size: new THREE.Vector3(0.5, 0.5, 0.5),
      category: "structure",
      supportGroupId: "crane-test",
      supportReleaseRadius: 3,
      supportReleaseHeight: 1,
      supportReleaseLowerHeight: 8,
      supportReleaseFallDirection: new THREE.Vector3(1, 0, 0),
      bodyType: "fixed"
    });

    physics.step(1 / 60);

    expect(physics.destabilizeUnsupportedStructures(weakPoint, new THREE.Vector3(0, 12, 0))).toBe(1);
    expect(physics.flushPendingSupportReleases(10, 0)).toBe(1);
    expect(support.bodyType).toBe("dynamic");

    physics.world.free();
  });

  test("applies heavy crane impact volume when the boom lands on a structure", () => {
    const generic = runConcreteImpact();
    expect(generic.result.fracturedBodies).toBe(0);
    expect(generic.result.affectedObjects[0]?.fractured).toBe(false);
    generic.physics.world.free();

    const crane = runConcreteImpact(13.5);
    expect(crane.result.fracturedBodies).toBe(1);
    expect(crane.result.affectedObjects[0]?.fractured).toBe(true);
    expect(crane.result.materialChaos).toBeGreaterThan(generic.result.materialChaos * 6);
    crane.physics.world.free();
  });
});

function runConcreteImpact(impactVolumeScale?: number): {
  physics: PhysicsWorld;
  result: ReturnType<DestructionSystem["impact"]>;
} {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld(scene);
  const renderMaterial = new THREE.MeshBasicMaterial();
  const source = physics.addDynamicBox({
    label: impactVolumeScale ? "Central construction crane boom assembly" : "generic metal beam",
    material: testMaterials.get("metal"),
    renderMaterial,
    position: new THREE.Vector3(0, 1.2, 0),
    size: new THREE.Vector3(0.9, 0.46, 0.9),
    category: "structure",
    bodyType: "dynamic",
    destructible: false,
    canFracture: false,
    chainSource: true,
    supportGroupId: impactVolumeScale ? "central-construction-crane" : undefined,
    impactVolumeScale
  });
  const target = physics.addDynamicBox({
    label: "concrete wall target",
    material: testMaterials.get("concrete"),
    renderMaterial,
    position: new THREE.Vector3(1.1, 1.2, 0),
    size: new THREE.Vector3(1, 1, 1),
    category: "structure",
    bodyType: "fixed",
    destructible: true,
    canFracture: true,
    scoreRole: "target",
    scoreValue: 100
  });
  const destruction = new DestructionSystem(physics, scene, testMaterials, { next: () => 0.99 });

  return {
    physics,
    result: destruction.impact(source, target, new THREE.Vector3(0.55, 1.2, 0), 1.05)
  };
}
