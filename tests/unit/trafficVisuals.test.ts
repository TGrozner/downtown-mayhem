import * as THREE from "three";
import { beforeAll, describe, expect, test } from "vitest";
import type { MaterialDefinition } from "../../src/materialCatalog";
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

describe("traffic visuals", () => {
  beforeAll(async () => {
    await initializeRapierCompat();
  });

  test("interpolates routed vehicle meshes between route ticks", () => {
    const physics = new PhysicsWorld(new THREE.Scene());
    const vehicle = physics.addDynamicBox({
      label: "test commuter",
      material: metal,
      renderMaterial: new THREE.MeshBasicMaterial(),
      position: new THREE.Vector3(0, 0.5, 0),
      size: new THREE.Vector3(1, 1, 1),
      category: "structure",
      trafficRoute: {
        axis: "x",
        min: 0,
        max: 10,
        speed: 1,
        direction: 1,
        laneOffset: 0
      }
    });

    physics.advanceTrafficRoutes(1 / 24);
    const bodyAfterRouteTick = vehicle.body.translation();
    expect(bodyAfterRouteTick.x).toBeCloseTo(1 / 24, 4);
    expect(vehicle.mesh.position.x).toBeCloseTo(0, 4);

    physics.updateTrafficVisuals(1 / 48);
    expect(vehicle.mesh.position.x).toBeGreaterThan(0);
    expect(vehicle.mesh.position.x).toBeLessThan(bodyAfterRouteTick.x);

    physics.updateTrafficVisuals(1 / 48);
    expect(vehicle.mesh.position.x).toBeCloseTo(bodyAfterRouteTick.x, 4);

    physics.world.free();
  });
});
