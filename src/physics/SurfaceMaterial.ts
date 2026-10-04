import type { Collider } from "@dimforge/rapier3d-compat";

/** Surface identities used by level definitions, physics, VFX, and audio. */
export type SurfaceMaterialId =
  "concrete" | "rusted-metal" | "polished-metal" | "rubber" | "ice" | "sand-coated-metal" | "energy";

/** Friendly aliases accepted from authored level data. */
export type SurfaceMaterialAlias = "rustedMetal" | "polishedMetal" | "sandCoatedMetal";

export type SurfaceMaterialInput = SurfaceMaterialId | SurfaceMaterialAlias;

export type SurfaceParticleStyle =
  | "concrete-dust"
  | "rust-sparks"
  | "metal-sparks"
  | "rubber-puff"
  | "ice-shards"
  | "sand-grit"
  | "energy-arcs";

export interface SurfaceAppearance {
  color: number;
  roughness: number;
  metalness: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export interface SurfaceGameplayModifier {
  /** Scales player drive torque while this surface is under the ball. */
  tractionMultiplier?: number;
  /** Scales the ball controller's braking impulse. */
  brakingMultiplier?: number;
  /** Multiplies the controller's speed cap while grounded. */
  maxSpeedMultiplier?: number;
}

export interface SurfaceMaterialDefinition {
  id: SurfaceMaterialId;
  label: string;
  friction: number;
  restitution: number;
  rollingSounds: readonly string[];
  impactSounds: readonly string[];
  particles: SurfaceParticleStyle;
  appearance: Readonly<SurfaceAppearance>;
  gameplay?: Readonly<SurfaceGameplayModifier>;
}

const definition = (value: SurfaceMaterialDefinition): Readonly<SurfaceMaterialDefinition> =>
  Object.freeze({
    ...value,
    rollingSounds: Object.freeze([...value.rollingSounds]),
    impactSounds: Object.freeze([...value.impactSounds]),
    appearance: Object.freeze({ ...value.appearance }),
    gameplay: value.gameplay ? Object.freeze({ ...value.gameplay }) : undefined
  });

/**
 * Keep these values intentionally distinct: the friction chamber should teach
 * players something visible and audible, rather than merely recoloring a beam.
 */
export const SURFACE_MATERIALS: Readonly<Record<SurfaceMaterialId, Readonly<SurfaceMaterialDefinition>>> =
  Object.freeze({
    concrete: definition({
      id: "concrete",
      label: "Concrete",
      friction: 0.86,
      restitution: 0.05,
      rollingSounds: ["roll_concrete_01", "roll_concrete_02"],
      impactSounds: ["impact_concrete_01", "impact_concrete_02"],
      particles: "concrete-dust",
      appearance: { color: 0x6a625a, roughness: 0.88, metalness: 0.04 }
    }),
    "rusted-metal": definition({
      id: "rusted-metal",
      label: "Rusted metal",
      friction: 0.71,
      restitution: 0.12,
      rollingSounds: ["roll_rust_01", "roll_rust_02"],
      impactSounds: ["impact_rust_01", "impact_rust_02"],
      particles: "rust-sparks",
      appearance: { color: 0x6b3e2d, roughness: 0.74, metalness: 0.62 }
    }),
    "polished-metal": definition({
      id: "polished-metal",
      label: "Polished metal",
      friction: 0.38,
      restitution: 0.18,
      rollingSounds: ["roll_polished_01", "roll_polished_02"],
      impactSounds: ["impact_polished_01", "impact_polished_02"],
      particles: "metal-sparks",
      appearance: { color: 0x34445a, roughness: 0.19, metalness: 0.95 },
      gameplay: { tractionMultiplier: 0.78, brakingMultiplier: 0.64 }
    }),
    rubber: definition({
      id: "rubber",
      label: "Rubber",
      friction: 1.35,
      restitution: 0.32,
      rollingSounds: ["roll_rubber_01", "roll_rubber_02"],
      impactSounds: ["impact_rubber_01", "impact_rubber_02"],
      particles: "rubber-puff",
      appearance: { color: 0x24222c, roughness: 0.62, metalness: 0.03 },
      gameplay: { tractionMultiplier: 1.12, brakingMultiplier: 1.18 }
    }),
    ice: definition({
      id: "ice",
      label: "Ice",
      friction: 0.045,
      restitution: 0.09,
      rollingSounds: ["roll_ice_01", "roll_ice_02"],
      impactSounds: ["impact_ice_01", "impact_ice_02"],
      particles: "ice-shards",
      appearance: {
        color: 0x9ec9df,
        roughness: 0.16,
        metalness: 0.14,
        emissive: 0x102a43,
        emissiveIntensity: 0.16
      },
      gameplay: { tractionMultiplier: 0.44, brakingMultiplier: 0.36 }
    }),
    "sand-coated-metal": definition({
      id: "sand-coated-metal",
      label: "Sand-coated metal",
      friction: 1.08,
      restitution: 0.035,
      rollingSounds: ["roll_sand_01", "roll_sand_02"],
      impactSounds: ["impact_sand_01", "impact_sand_02"],
      particles: "sand-grit",
      appearance: { color: 0x8f6735, roughness: 0.94, metalness: 0.31 },
      gameplay: { tractionMultiplier: 1.08, brakingMultiplier: 1.1 }
    }),
    energy: definition({
      id: "energy",
      label: "Energy surface",
      friction: 0.58,
      restitution: 0.44,
      rollingSounds: ["roll_energy_01", "roll_energy_02"],
      impactSounds: ["impact_energy_01", "impact_energy_02"],
      particles: "energy-arcs",
      appearance: {
        color: 0x384d8d,
        roughness: 0.32,
        metalness: 0.58,
        emissive: 0x3a74ff,
        emissiveIntensity: 1.2
      },
      gameplay: { tractionMultiplier: 0.9, maxSpeedMultiplier: 1.12 }
    })
  });

export const DEFAULT_SURFACE_MATERIAL: SurfaceMaterialId = "concrete";

const SURFACE_ALIASES: Readonly<Record<SurfaceMaterialAlias, SurfaceMaterialId>> = Object.freeze({
  rustedMetal: "rusted-metal",
  polishedMetal: "polished-metal",
  sandCoatedMetal: "sand-coated-metal"
});

export function normalizeSurfaceMaterialId(
  id?: SurfaceMaterialInput | string | null
): SurfaceMaterialId | undefined {
  if (!id) {
    return undefined;
  }

  if (id in SURFACE_MATERIALS) {
    return id as SurfaceMaterialId;
  }

  if (id in SURFACE_ALIASES) {
    return SURFACE_ALIASES[id as SurfaceMaterialAlias];
  }

  return undefined;
}

/** Returns a safe concrete fallback for undefined or unrecognized level data. */
export function getSurfaceMaterial(
  id?: SurfaceMaterialInput | string | null
): Readonly<SurfaceMaterialDefinition> {
  const normalized = normalizeSurfaceMaterialId(id);
  if (normalized) {
    return SURFACE_MATERIALS[normalized];
  }

  return SURFACE_MATERIALS[DEFAULT_SURFACE_MATERIAL];
}

export function isSurfaceMaterialId(value: unknown): value is SurfaceMaterialId {
  return typeof value === "string" && normalizeSurfaceMaterialId(value) !== undefined;
}

/** Applies the physical half of a surface definition to an existing collider. */
export function applySurfaceMaterialToCollider(
  collider: Collider,
  material: SurfaceMaterialInput | SurfaceMaterialDefinition
): Readonly<SurfaceMaterialDefinition> {
  const resolved = typeof material === "string" ? getSurfaceMaterial(material) : material;

  collider.setFriction(resolved.friction);
  collider.setRestitution(resolved.restitution);
  return resolved;
}
