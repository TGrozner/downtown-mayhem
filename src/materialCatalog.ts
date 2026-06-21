import * as THREE from "three";
import { materialAtlasTile } from "./visualAssets";

export type MaterialId = "wood" | "glass" | "concrete" | "metal" | "rubber" | "foam";

export interface MaterialDefinition {
  id: MaterialId;
  name: string;
  key: string;
  color: THREE.Color;
  dustColor: THREE.Color;
  density: number;
  massFactor: number;
  friction: number;
  restitution: number;
  fractureThreshold: number;
  fragmentCount: [number, number];
  angularResponse: number;
  fragmentLife: number;
  description: string;
}

export class MaterialCatalog {
  readonly order: MaterialId[] = ["wood", "glass", "concrete", "metal", "rubber", "foam"];
  readonly definitions: Record<MaterialId, MaterialDefinition>;

  private readonly renderMaterials = new Map<MaterialId, THREE.Material>();
  private readonly chargeMaterial = new THREE.MeshStandardMaterial({
    color: 0x69f7ff,
    emissive: 0x1ed7ff,
    emissiveIntensity: 2.4,
    roughness: 0.22,
    metalness: 0.3
  });

  constructor() {
    this.definitions = {
      wood: {
        id: "wood",
        name: "Wood",
        key: "1",
        color: new THREE.Color(0xb86f34),
        dustColor: new THREE.Color(0xc08a4a),
        density: 0.72,
        massFactor: 1.15,
        friction: 0.72,
        restitution: 0.18,
        fractureThreshold: 30,
        fragmentCount: [9, 16],
        angularResponse: 1.05,
        fragmentLife: 20,
        description: "Medium mass, splinters into warm cuboids."
      },
      glass: {
        id: "glass",
        name: "Glass",
        key: "2",
        color: new THREE.Color(0x83f4ff),
        dustColor: new THREE.Color(0xb6fbff),
        density: 0.38,
        massFactor: 0.62,
        friction: 0.18,
        restitution: 0.58,
        fractureThreshold: 16,
        fragmentCount: [18, 30],
        angularResponse: 1.35,
        fragmentLife: 16,
        description: "Light, slick, and eager to become shards."
      },
      concrete: {
        id: "concrete",
        name: "Concrete",
        key: "3",
        color: new THREE.Color(0x858981),
        dustColor: new THREE.Color(0x9c9b91),
        density: 2.2,
        massFactor: 2.75,
        friction: 0.92,
        restitution: 0.08,
        fractureThreshold: 50,
        fragmentCount: [10, 18],
        angularResponse: 0.62,
        fragmentLife: 28,
        description: "Heavy, dusty, and slow to move."
      },
      metal: {
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
        description: "Very heavy, throws fewer spinning beams."
      },
      rubber: {
        id: "rubber",
        name: "Rubber",
        key: "5",
        color: new THREE.Color(0xe94573),
        dustColor: new THREE.Color(0xff6c92),
        density: 0.95,
        massFactor: 1.0,
        friction: 0.88,
        restitution: 0.82,
        fractureThreshold: 54,
        fragmentCount: [6, 11],
        angularResponse: 1.2,
        fragmentLife: 22,
        description: "Springy medium-weight blocks."
      },
      foam: {
        id: "foam",
        name: "Foam / Plastic",
        key: "6",
        color: new THREE.Color(0xf5d56f),
        dustColor: new THREE.Color(0xffe8a8),
        density: 0.18,
        massFactor: 0.35,
        friction: 0.24,
        restitution: 0.34,
        fractureThreshold: 22,
        fragmentCount: [11, 20],
        angularResponse: 1.55,
        fragmentLife: 14,
        description: "Very light and flies far."
      }
    };

    for (const id of this.order) {
      this.renderMaterials.set(id, this.createRenderMaterial(id));
    }
  }

  get(id: MaterialId): MaterialDefinition {
    return this.definitions[id];
  }

  getRenderMaterial(id: MaterialId): THREE.Material {
    const material = this.renderMaterials.get(id);
    if (!material) {
      throw new Error(`Unknown material ${id}`);
    }
    return material;
  }

  getChargeMaterial(): THREE.Material {
    return this.chargeMaterial;
  }

  next(id: MaterialId, direction = 1): MaterialId {
    const index = this.order.indexOf(id);
    const nextIndex = (index + direction + this.order.length) % this.order.length;
    return this.order[nextIndex];
  }

  private createRenderMaterial(id: MaterialId): THREE.Material {
    const def = this.get(id);

    if (id === "glass") {
      return new THREE.MeshPhysicalMaterial({
        color: 0x7fe8f4,
        transparent: true,
        opacity: 0.5,
        roughness: 0.14,
        metalness: 0,
        map: materialAtlasTile(8),
        transmission: 0.22,
        thickness: 0.42,
        clearcoat: 0.75,
        clearcoatRoughness: 0.18,
        depthWrite: false,
        envMapIntensity: 1.05
      });
    }

    if (id === "metal") {
      return new THREE.MeshStandardMaterial({
        color: 0x465765,
        roughness: 0.31,
        metalness: 0.9,
        map: materialAtlasTile(0),
        envMapIntensity: 0.95
      });
    }

    if (id === "rubber") {
      return new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.84,
        metalness: 0.02,
        map: materialAtlasTile(6)
      });
    }

    if (id === "foam") {
      return new THREE.MeshStandardMaterial({
        color: 0xf4df82,
        roughness: 0.74,
        metalness: 0.0,
        map: materialAtlasTile(7)
      });
    }

    if (id === "wood") {
      return new THREE.MeshStandardMaterial({
        color: 0xa96431,
        roughness: 0.7,
        metalness: 0,
        map: materialAtlasTile(14)
      });
    }

    return new THREE.MeshStandardMaterial({
      color: 0x777b76,
      roughness: 0.96,
      metalness: 0,
      map: materialAtlasTile(3)
    });
  }
}
