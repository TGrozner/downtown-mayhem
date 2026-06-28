import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MaterialId } from "./materialCatalog";
import type { ScoreRole } from "./physics";

const DOWNTOWN_BUILDING_MODEL_PATH = "assets/models/quaternius-downtown-city-megakit/building_large.glb";
const DRACO_DECODER_PATH = "assets/vendor/draco/gltf/";
const FLOOR_GAP = 0.012;
const COLUMN_GAP = 0.035;

interface BuildingKitPrototype {
  root: THREE.Object3D;
  size: THREE.Vector3;
}

export interface DowntownBuildingSkinOptions {
  size: THREE.Vector3;
  materialId: MaterialId;
  scoreRole: ScoreRole;
  style: string;
  floorBase: number;
  columnBase: number;
  groupFloors: number;
  groupColumns: number;
  floors: number;
  columns: number;
  stackCellSize: THREE.Vector3;
  stagger: number;
}

let loadPromise: Promise<void> | null = null;
let prototype: BuildingKitPrototype | null = null;
let warnedLoadFailure = false;
const simplifiedMaterialCache = new WeakMap<THREE.Material, THREE.Material>();

export function preloadDowntownBuildingKit(): Promise<void> {
  loadPromise ??= loadDowntownBuildingKit();
  return loadPromise;
}

export function createDowntownBuildingSkin(options: DowntownBuildingSkinOptions): THREE.Object3D | null {
  if (!prototype || !shouldAttachDowntownSkin(options)) {
    return null;
  }

  const stack = stackMetrics(options);
  const model = prototype.root.clone(true);
  model.name = "Quaternius Downtown City MegaKit building skin instance";
  model.scale.set(
    (stack.fullSize.x * 1.025) / prototype.size.x,
    stack.fullSize.y / prototype.size.y,
    (stack.fullSize.z * 1.035) / prototype.size.z
  );
  applyPerInstanceFacadeVariation(model, options);

  const root = new THREE.Group();
  root.name = "Quaternius Downtown City MegaKit building skin";
  root.position.copy(stack.baseOffsetFromGroupCenter);
  root.add(model);
  return root;
}

function shouldAttachDowntownSkin(options: DowntownBuildingSkinOptions): boolean {
  if (options.floorBase !== 0 || options.columnBase !== 0) {
    return false;
  }
  if (options.floors < 6 || options.columns < 4) {
    return false;
  }
  if (options.style !== "apartment" && options.style !== "civic") {
    return false;
  }
  const metrics = stackMetrics(options);
  if (metrics.fullSize.x < 2.1 || metrics.fullSize.y < 4.6) {
    return false;
  }
  return options.materialId === "concrete" || options.materialId === "glass" || options.materialId === "metal";
}

function stackMetrics(options: DowntownBuildingSkinOptions): {
  fullSize: THREE.Vector3;
  baseOffsetFromGroupCenter: THREE.Vector3;
} {
  const groupColumnCenter = options.columnBase + (options.groupColumns - 1) * 0.5;
  const stackColumnCenter = (options.columns - 1) * 0.5;
  const groupHeight = options.stackCellSize.y * options.groupFloors - FLOOR_GAP * Math.max(0, options.groupFloors - 1);
  const floorStep = options.stackCellSize.y - FLOOR_GAP;
  const groupCenter = new THREE.Vector3(
    (groupColumnCenter - stackColumnCenter) * (options.stackCellSize.x + COLUMN_GAP),
    groupHeight * 0.5 + options.floorBase * floorStep,
    options.stagger * (groupColumnCenter - stackColumnCenter) * 0.28
  );
  const rawFullWidth = options.stackCellSize.x * options.columns + COLUMN_GAP * Math.max(0, options.columns - 1);
  const rawFullDepth = options.stackCellSize.z + Math.abs(options.stagger) * Math.max(0, options.columns - 1) * 0.28;
  const fullSize = new THREE.Vector3(
    rawFullWidth,
    options.stackCellSize.y * options.floors - FLOOR_GAP * Math.max(0, options.floors - 1),
    Math.max(rawFullDepth, rawFullWidth * 0.52)
  );
  return {
    fullSize,
    baseOffsetFromGroupCenter: groupCenter.multiplyScalar(-1)
  };
}

async function loadDowntownBuildingKit(): Promise<void> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(assetUrl(DRACO_DECODER_PATH));
  loader.setDRACOLoader(draco);

  try {
    const gltf = await loader.loadAsync(assetUrl(DOWNTOWN_BUILDING_MODEL_PATH));
    prototype = preparePrototype(gltf.scene);
  } catch (error) {
    if (!warnedLoadFailure) {
      warnedLoadFailure = true;
      console.warn("Downtown Mayhem: Quaternius building kit failed to load; using procedural facades.", error);
    }
    prototype = null;
  } finally {
    draco.dispose();
  }
}

function preparePrototype(scene: THREE.Object3D): BuildingKitPrototype {
  scene.name = "Quaternius Downtown City MegaKit building_large prototype";
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);
  scene.position.set(-center.x, -bounds.min.y, -center.z);
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    object.castShadow = false;
    object.receiveShadow = true;
    object.userData.disposeMaterial = false;
    object.geometry.userData.sharedGeometry = true;
    object.material = simplifyModelMaterial(object.material);
  });
  return {
    root: scene,
    size
  };
}

function simplifyModelMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => simplifiedMaterial(entry));
  }
  return simplifiedMaterial(material);
}

function simplifiedMaterial(source: THREE.Material): THREE.Material {
  const cached = simplifiedMaterialCache.get(source);
  if (cached) {
    return cached;
  }
  const standard = source as THREE.MeshStandardMaterial;
  const material = new THREE.MeshStandardMaterial({
    name: `${source.name || "downtown"} simplified`,
    color: standard.color?.clone() ?? new THREE.Color(0xffffff),
    map: standard.map ?? null,
    roughness: source.name.toLowerCase().includes("glass") ? 0.38 : 0.84,
    metalness: 0.04,
    transparent: false,
    opacity: 1,
    side: THREE.FrontSide
  });
  material.userData.disposeMaterial = false;
  material.userData.downtownBuildingKitMaterial = true;
  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.map.anisotropy = 8;
    material.map.needsUpdate = true;
  }
  simplifiedMaterialCache.set(source, material);
  return material;
}

function applyPerInstanceFacadeVariation(model: THREE.Object3D, options: DowntownBuildingSkinOptions): void {
  const rotationKey = hashSkinOptions(options);
  if (rotationKey % 2 === 1) {
    model.rotation.y = Math.PI;
  }
}

function hashSkinOptions(options: DowntownBuildingSkinOptions): number {
  const source = `${options.style}:${options.materialId}:${options.scoreRole}:${options.floors}:${options.columns}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${path}`;
}
