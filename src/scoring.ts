import * as THREE from "three";
import type { ExplosionAffectedObject, ExplosionResult } from "./destruction";
import { PhysicsWorld } from "./physics";
import type { ProjectileDefinition } from "./projectile";

const CHAIN_BASE_POINTS_CAP = 900;
const CHAIN_AWARDED_POINTS_CAP = 1_200;
const DAMAGE_HOTSPOT_LIMIT = 4;

export type ScoreEventKind = "target" | "chain" | "chaos";

export interface ScoreEvent {
  kind: ScoreEventKind;
  label: string;
  points: number;
  position: THREE.Vector3;
  combo?: number;
}

export interface ScoreBreakdown {
  targetDamage: number;
  collateralChaos: number;
  chainReactionBonus: number;
  remainingDebrisMotion: number;
  weakPointBreakCount: number;
  bossBreakCount: number;
  damageHotspots: ScoreDamageHotspot[];
  mayhemRating: string;
  totalScore: number;
  shotName: string;
  chainReactionCount: number;
  maxChainCombo: number;
}

export interface ScoreDamageHotspot {
  label: string;
  points: number;
  targetDamage: number;
  collateralDamage: number;
  hits: number;
}

interface MutableScoreDamageHotspot extends ScoreDamageHotspot {
  sortIndex: number;
}

interface TargetScoreContribution {
  object: ExplosionAffectedObject;
  points: number;
}

export class ShotScoreTracker {
  private targetDamage = 0;
  private collateralChaos = 0;
  private chainReactionBonus = 0;
  private currentProjectile: ProjectileDefinition | null = null;
  private chainReactionCount = 0;
  private maxChainCombo = 0;
  private readonly scoredObjects = new Map<number, number>();
  private readonly weakPointBreakObjectIds = new Set<number>();
  private readonly bossBreakObjectIds = new Set<number>();
  private readonly damageHotspots = new Map<string, MutableScoreDamageHotspot>();

  beginShot(projectile: ProjectileDefinition): void {
    this.targetDamage = 0;
    this.collateralChaos = 0;
    this.chainReactionBonus = 0;
    this.chainReactionCount = 0;
    this.maxChainCombo = 0;
    this.currentProjectile = projectile;
    this.scoredObjects.clear();
    this.weakPointBreakObjectIds.clear();
    this.bossBreakObjectIds.clear();
    this.damageHotspots.clear();
  }

  addExplosion(result: ExplosionResult): ScoreEvent[] {
    const events: ScoreEvent[] = [];
    this.recordSpecialBreaks(result);
    const target = this.dedupPositive(result);
    this.targetDamage += target.points;
    this.collateralChaos += result.materialChaos;
    this.recordDamageHotspots(result, target.contributions);
    events.push(...target.events);
    events.push(...this.collateralEvents(result));

    if (result.materialChaos >= 95) {
      events.push({
        kind: "chaos",
        label: "COLLATERAL SURGE",
        points: Math.round(result.materialChaos),
        position: result.origin.clone().add(new THREE.Vector3(0, 0.72, 0))
      });
    }
    return events;
  }

  addChainReaction(points: number, position?: THREE.Vector3, label?: string): ScoreEvent[] {
    this.chainReactionCount += 1;
    this.maxChainCombo = Math.max(this.maxChainCombo, this.chainReactionCount);
    const combo = this.chainReactionCount;
    const cappedPoints = Math.min(points, CHAIN_BASE_POINTS_CAP);
    const multiplier = 1 + Math.min(0.9, (combo - 1) * 0.12);
    const decay = combo <= 3 ? 1 : 1 / (1 + (combo - 3) * 0.18);
    const awarded = Math.min(CHAIN_AWARDED_POINTS_CAP, Math.round(cappedPoints * multiplier * decay));
    this.chainReactionBonus += awarded;
    if (!position) {
      return [];
    }
    return [
      {
        kind: "chain",
        label: label ? chainSourceLabel(label, combo) : chainLabel(combo),
        points: awarded,
        combo,
        position: position.clone().add(new THREE.Vector3(0, 1.1, 0))
      }
    ];
  }

  finalize(physics: PhysicsWorld): ScoreBreakdown {
    const remainingDebrisMotion = Math.round(
      physics
        .getDynamicObjects()
        .filter((object) => object.category !== "projectile")
        .reduce((sum, object) => {
          const velocity = object.body.linvel();
          const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
          return sum + Math.min(80, speed * (object.isDebris ? 5.5 : 2.6));
        }, 0)
    );
    return this.buildScoreBreakdown(remainingDebrisMotion);
  }

  preview(): ScoreBreakdown {
    return this.buildScoreBreakdown(0);
  }

  private buildScoreBreakdown(remainingDebrisMotion: number): ScoreBreakdown {
    const projectile = this.currentProjectile;
    const modifier = projectile?.scoreModifier ?? 1;
    const raw =
      this.targetDamage +
      this.collateralChaos +
      this.chainReactionBonus +
      remainingDebrisMotion;
    const modifiedRaw = raw * modifier;
    const totalScore = Math.max(0, Math.round(modifiedRaw));
    return {
      targetDamage: Math.round(this.targetDamage * modifier),
      collateralChaos: Math.round(this.collateralChaos * modifier),
      chainReactionBonus: Math.round(this.chainReactionBonus * modifier),
      remainingDebrisMotion: Math.round(remainingDebrisMotion * modifier),
      weakPointBreakCount: this.weakPointBreakObjectIds.size,
      bossBreakCount: this.bossBreakObjectIds.size,
      damageHotspots: this.rankedDamageHotspots(modifier),
      mayhemRating: mayhemRating(totalScore),
      totalScore,
      shotName: projectile?.name ?? "No Shot",
      chainReactionCount: this.chainReactionCount,
      maxChainCombo: this.maxChainCombo
    };
  }

  private dedupPositive(result: ExplosionResult): { points: number; events: ScoreEvent[]; contributions: TargetScoreContribution[] } {
    let points = 0;
    const events: ScoreEvent[] = [];
    const contributions: TargetScoreContribution[] = [];
    for (const object of result.affectedObjects) {
      if (object.scoreRole !== "target") {
        continue;
      }
      const next = Math.max(0, Math.round(object.weightedDamage * (object.fractured ? 1.1 : 0.55)));
      const previous = this.scoredObjects.get(object.id) ?? 0;
      if (next > previous) {
        const delta = next - previous;
        points += delta;
        contributions.push({ object, points: delta });
        events.push(scoreEventFromObject("target", objectScoreLabel(object), delta, object));
        this.scoredObjects.set(object.id, next);
      }
    }
    return { points, events: events.sort(sortScoreEvents).slice(0, 7), contributions };
  }

  private recordSpecialBreaks(result: ExplosionResult): void {
    for (const object of result.affectedObjects) {
      if (!object.fractured) {
        continue;
      }
      if (isWeakPointObject(object)) {
        this.weakPointBreakObjectIds.add(object.id);
      }
      if (isBossObject(object)) {
        this.bossBreakObjectIds.add(object.id);
      }
    }
  }

  private recordDamageHotspots(result: ExplosionResult, targetContributions: TargetScoreContribution[]): void {
    const targetObjectIds = new Set<number>();
    for (const contribution of targetContributions) {
      targetObjectIds.add(contribution.object.id);
      this.addDamageHotspot(contribution.object, contribution.points, "target");
    }

    const weightedObjects = result.affectedObjects.filter((object) => object.weightedDamage > 0);
    const totalWeightedDamage = weightedObjects.reduce((sum, object) => sum + object.weightedDamage, 0);
    if (result.materialChaos <= 0 || totalWeightedDamage <= 0) {
      return;
    }

    let allocatedChaos = 0;
    weightedObjects.forEach((object, index) => {
      const points =
        index === weightedObjects.length - 1
          ? Math.max(0, Math.round(result.materialChaos) - allocatedChaos)
          : Math.round(result.materialChaos * (object.weightedDamage / totalWeightedDamage));
      if (points <= 0) {
        return;
      }
      allocatedChaos += points;
      this.addDamageHotspot(object, points, "collateral", !targetObjectIds.has(object.id));
    });
  }

  private addDamageHotspot(object: ExplosionAffectedObject, points: number, kind: "target" | "collateral", countHit = true): void {
    const label = damageHotspotLabel(object);
    const key = damageHotspotKey(label);
    const current =
      this.damageHotspots.get(key) ??
      {
        label,
        points: 0,
        targetDamage: 0,
        collateralDamage: 0,
        hits: 0,
        sortIndex: this.damageHotspots.size
      };
    current.points += points;
    if (countHit) {
      current.hits += 1;
    }
    if (kind === "target") {
      current.targetDamage += points;
    } else {
      current.collateralDamage += points;
    }
    this.damageHotspots.set(key, current);
  }

  private rankedDamageHotspots(modifier: number): ScoreDamageHotspot[] {
    return [...this.damageHotspots.values()]
      .sort((a, b) => b.points - a.points || b.hits - a.hits || a.sortIndex - b.sortIndex)
      .slice(0, DAMAGE_HOTSPOT_LIMIT)
      .map((hotspot) => ({
        label: hotspot.label,
        points: Math.round(hotspot.points * modifier),
        targetDamage: Math.round(hotspot.targetDamage * modifier),
        collateralDamage: Math.round(hotspot.collateralDamage * modifier),
        hits: hotspot.hits
      }));
  }

  private collateralEvents(result: ExplosionResult): ScoreEvent[] {
    const events: ScoreEvent[] = [];
    for (const object of result.affectedObjects) {
      if (object.scoreRole === "target") {
        continue;
      }
      const points = collateralObjectScorePoints(object);
      if (points < 18) {
        continue;
      }
      events.push(scoreEventFromObject("chaos", objectScoreLabel(object), points, object));
    }
    return events.sort(sortScoreEvents).slice(0, 2);
  }
}

function isWeakPointObject(object: ExplosionAffectedObject): boolean {
  const text = searchableObjectText(object);
  return (
    text.includes("weak-point") ||
    text.includes("weak point") ||
    text.includes("shear pin") ||
    text.includes("hoist pin") ||
    text.includes("latch") ||
    text.includes("coupler") ||
    text.includes("support column") ||
    text.includes("support pier") ||
    text.includes("release")
  );
}

function isBossObject(object: ExplosionAffectedObject): boolean {
  const text = searchableObjectText(object);
  return text.includes("unique-boss") || text.includes("breaker-boss") || text.includes("archive-boss") || text.includes(" boss");
}

function searchableObjectText(object: ExplosionAffectedObject): string {
  return `${object.label} ${object.zoneId ?? ""}`.toLowerCase();
}

function scoreEventFromObject(kind: ScoreEventKind, label: string, points: number, object: ExplosionAffectedObject): ScoreEvent {
  return {
    kind,
    label,
    points,
    position: object.position.clone().add(new THREE.Vector3(0, object.fractured ? 0.88 : 0.58, 0))
  };
}

function sortScoreEvents(a: ScoreEvent, b: ScoreEvent): number {
  return Math.abs(b.points) - Math.abs(a.points);
}

function collateralObjectScorePoints(object: ExplosionAffectedObject): number {
  return Math.round(object.weightedDamage * (object.fractured ? 0.42 : 0.24));
}

function damageHotspotKey(label: string): string {
  return label.toLowerCase();
}

function damageHotspotLabel(object: ExplosionAffectedObject): string {
  const text = searchableObjectText(object);
  if (text.includes("nuclear-plant") || text.includes("nuclear plant")) {
    return "Nuclear plant";
  }
  if (text.includes("energy-plant") || text.includes("energy plant")) {
    return "Energy plant";
  }
  if (text.includes("gas-station") || text.includes("gas station") || text.includes("fuel-pump") || text.includes("gas-line")) {
    return "Gas station";
  }
  if (text.includes("electric-substation") || text.includes("electric substation") || text.includes("substation")) {
    return "Substation";
  }
  if (text.includes("propane-depot") || text.includes("propane")) {
    return "Propane depot";
  }
  if (text.includes("parking-silo") || text.includes("parking garage")) {
    return "Parking silo";
  }
  if (text.includes("elevated-metro") || text.includes("elevated metro")) {
    return "Elevated metro";
  }
  if (text.includes("skyneedle")) {
    return "Skyneedle";
  }
  if (text.includes("construction-scaffold") || text.includes("construction scaffold")) {
    return "Scaffolds";
  }
  if (text.includes("breaker-boss")) {
    return "Breaker boss";
  }
  if (text.includes("breaker-spine")) {
    return "Breaker spine";
  }
  if (text.includes("archive-boss")) {
    return "Archive boss";
  }
  if (text.includes("glass-depot") || text.includes("glass depot")) {
    return "Glass depot";
  }
  if (text.includes("moving-vehicles") || text.includes("vehicle") || text.includes("truck") || text.includes("bus")) {
    return "Vehicle grid";
  }
  return compactDamageLabel(object.label);
}

function compactDamageLabel(label: string): string {
  return label
    .replace(/\bweak point\b/gi, "")
    .replace(/\bsignature debris\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 38);
}

function chainLabel(combo: number): string {
  if (combo >= 4) {
    return `MAYHEM COMBO x${combo}`;
  }
  if (combo >= 3) {
    return `CASCADE x${combo}`;
  }
  if (combo >= 2) {
    return `CHAIN x${combo}`;
  }
  return "CHAIN START";
}

function chainSourceLabel(label: string, combo: number): string {
  return combo >= 2 ? `${label} x${combo}` : label;
}

function objectScoreLabel(object: ExplosionAffectedObject): string {
  if (object.scoreRole === "target") {
    if (isWeakPointObject(object)) {
      return `${weakPointLabel(object)} ${object.fractured ? "BREAK" : "HIT"}`;
    }
    if (isBossObject(object)) {
      return object.fractured ? "BOSS BREAK" : "BOSS HIT";
    }
    return object.fractured ? "TARGET BREAK" : "TARGET HIT";
  }
  return `${materialLabel(object.materialId)} ${object.fractured ? fracturedVerb(object.materialId) : damagedVerb(object.materialId)}`;
}

function weakPointLabel(object: ExplosionAffectedObject): string {
  const text = searchableObjectText(object);
  if (text.includes("shear pin")) {
    return "SHEAR PIN";
  }
  if (text.includes("hoist pin")) {
    return "HOIST PIN";
  }
  if (text.includes("latch")) {
    return "LATCH";
  }
  if (text.includes("coupler")) {
    return "COUPLER";
  }
  if (text.includes("support column") || text.includes("support pier")) {
    return "SUPPORT";
  }
  if (text.includes("release")) {
    return "RELEASE";
  }
  return "WEAK POINT";
}

function materialLabel(materialId: ExplosionAffectedObject["materialId"]): string {
  switch (materialId) {
    case "glass":
      return "GLASS";
    case "metal":
      return "METAL";
    case "wood":
      return "WOOD";
    case "foam":
      return "FOAM";
    case "rubber":
      return "RUBBER";
    case "concrete":
      return "CONCRETE";
  }
}

function fracturedVerb(materialId: ExplosionAffectedObject["materialId"]): string {
  switch (materialId) {
    case "glass":
      return "SHATTER";
    case "metal":
      return "CRUMPLE";
    case "wood":
      return "SPLINTER";
    case "foam":
      return "POP";
    case "rubber":
      return "RUPTURE";
    case "concrete":
      return "CRACK";
  }
}

function damagedVerb(materialId: ExplosionAffectedObject["materialId"]): string {
  switch (materialId) {
    case "glass":
      return "RATTLE";
    case "metal":
      return "DENT";
    case "wood":
      return "CHIP";
    case "foam":
      return "BUCKLE";
    case "rubber":
      return "BOUNCE";
    case "concrete":
      return "CHIP";
  }
}

function mayhemRating(totalScore: number): string {
  if (totalScore >= 540_000) {
    return "MAXIMUM MAYHEM";
  }
  if (totalScore >= 340_000) {
    return "CITY WRECKER";
  }
  if (totalScore >= 200_000) {
    return "DISTRICT WRECKER";
  }
  return "SPARK SHOW";
}
