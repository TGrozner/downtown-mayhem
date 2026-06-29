import * as THREE from "three";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CameraRig } from "../../src/cameraRig";

function createCameraRig(width = 1280, height = 720): CameraRig {
  vi.stubGlobal("window", { innerWidth: width, innerHeight: height, devicePixelRatio: 1 });
  return new CameraRig({
    setPixelRatio: vi.fn(),
    setSize: vi.fn()
  });
}

describe("CameraRig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("keeps cinematic impacts in a wide city overview instead of a close cut", () => {
    const rig = createCameraRig();
    const impact = new THREE.Vector3(16, 2, -14);

    rig.followProjectile(new THREE.Vector3(12, 4, -10), new THREE.Vector3(18, -2, -16));
    rig.update(1 / 60);
    rig.cinematicImpact(impact, 2.2, new THREE.Vector3(1, 0, -1));
    rig.update(0.5);

    const desiredPosition = (rig as unknown as { desiredPosition: THREE.Vector3 }).desiredPosition;
    const desiredTarget = (rig as unknown as { desiredTarget: THREE.Vector3 }).desiredTarget;

    expect(desiredPosition.distanceTo(desiredTarget)).toBeGreaterThan(35);
    expect(desiredPosition.y - desiredTarget.y).toBeGreaterThan(14);
    expect(desiredTarget.distanceTo(new THREE.Vector3(0, 2.2, 0.9))).toBeLessThan(3.8);
  });
});
