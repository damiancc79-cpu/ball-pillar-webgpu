/**
 * Shared tuning values for the fixed-step simulation and the player ball.
 *
 * The values deliberately live outside of the controller so a level, debug UI,
 * or automated test can use the same source of truth without constructing
 * Rapier or Three.js objects.
 */

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface BallPhysicsConfig {
  mass: number;
  radius: number;
  accelerationTorque: number;
  airControlMultiplier: number;
  brakeStrength: number;
  boostMultiplier: number;
  maxLinearSpeed: number;
  maxAngularSpeed: number;
  linearDamping: number;
  angularDamping: number;
  /** Target upward velocity applied by a grounded jump. */
  jumpVelocity: number;
  /** Prevents a held or rapidly tapped control from stacking jump impulses. */
  jumpCooldownSeconds: number;
  defaultFriction: number;
  restitution: number;
  fallHeight: number;
  respawnDelayMs: number;
}

export interface PhysicsWorldConfig {
  gravity: Vector3Like;
  fixedTimestep: number;
  maxSubSteps: number;
  maxFrameDelta: number;
  solverIterations: number;
  ccdSubsteps: number;
}

export const FIXED_TIMESTEP = 1 / 60;

export const DEFAULT_BALL_PHYSICS_CONFIG: Readonly<BallPhysicsConfig> = Object.freeze({
  mass: 4.5,
  radius: 0.58,
  accelerationTorque: 22,
  airControlMultiplier: 0.24,
  brakeStrength: 11,
  boostMultiplier: 1.42,
  maxLinearSpeed: 15,
  maxAngularSpeed: 29,
  linearDamping: 0.12,
  angularDamping: 0.22,
  jumpVelocity: 6.8,
  jumpCooldownSeconds: 0.18,
  defaultFriction: 0.82,
  restitution: 0.08,
  fallHeight: -35,
  respawnDelayMs: 650
});

export const DEFAULT_PHYSICS_WORLD_CONFIG: Readonly<PhysicsWorldConfig> = Object.freeze({
  gravity: Object.freeze({ x: 0, y: -18, z: 0 }),
  fixedTimestep: FIXED_TIMESTEP,
  maxSubSteps: 5,
  maxFrameDelta: 0.1,
  solverIterations: 8,
  ccdSubsteps: 2
});

/** Creates a mutable, independent player configuration. */
export function createBallPhysicsConfig(overrides: Partial<BallPhysicsConfig> = {}): BallPhysicsConfig {
  return { ...DEFAULT_BALL_PHYSICS_CONFIG, ...overrides };
}

/** Creates a mutable, independent world configuration. */
export function createPhysicsWorldConfig(overrides: Partial<PhysicsWorldConfig> = {}): PhysicsWorldConfig {
  return {
    ...DEFAULT_PHYSICS_WORLD_CONFIG,
    ...overrides,
    gravity: { ...DEFAULT_PHYSICS_WORLD_CONFIG.gravity, ...overrides.gravity }
  };
}
