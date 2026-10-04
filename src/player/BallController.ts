import type { Collider, RigidBody } from "@dimforge/rapier3d-compat";

import {
  createBallPhysicsConfig,
  type BallPhysicsConfig,
  type QuaternionLike,
  type Vector3Like
} from "../config/PhysicsConfig";
import { type PhysicsBody, type PhysicsWorld } from "../physics/PhysicsWorld";
import { getSurfaceMaterial, type SurfaceMaterialDefinition } from "../physics/SurfaceMaterial";

export interface InputAxis {
  /** Left (-1) to right (+1) movement relative to the active camera. */
  x: number;
  /** Backward (-1) to forward (+1) movement relative to the active camera. */
  y: number;
}

export interface BallControlFlags {
  brake?: boolean;
  boost?: boolean;
  /** Edge-triggered grounded hop. */
  jump?: boolean;
  /** Narrow-section mode: retains physical motion but makes new input gentler. */
  precision?: boolean;
  /** Allows a caller to stop accepting gameplay input without freezing Rapier. */
  enabled?: boolean;
  /** Convenience hook for a reset/checkpoint input action. */
  reset?: boolean;
}

export interface BallControllerOptions {
  collider?: Collider;
  config?: Partial<BallPhysicsConfig>;
  spawnPosition?: Vector3Like;
  spawnRotation?: QuaternionLike;
  onFall?: () => void;
  onRespawn?: (position: Vector3Like) => void;
}

export interface BallControllerState {
  grounded: boolean;
  groundNormal: Vector3Like;
  surface: Readonly<SurfaceMaterialDefinition>;
  linearSpeed: number;
  angularSpeed: number;
  isRespawning: boolean;
  /** True only on the simulation step that accepted a jump. */
  jumped: boolean;
}

const UP: Vector3Like = { x: 0, y: 1, z: 0 };
const ZERO: Vector3Like = { x: 0, y: 0, z: 0 };
const IDENTITY: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };

function clone(vector: Vector3Like): Vector3Like {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function magnitude(vector: Vector3Like): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vector3Like): Vector3Like | null {
  const length = magnitude(vector);
  if (length < 0.000001) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function dot(a: Vector3Like, b: Vector3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3Like, b: Vector3Like): Vector3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function subtract(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function multiply(vector: Vector3Like, scalar: number): Vector3Like {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar
  };
}

function isPhysicsBody(value: PhysicsBody | RigidBody): value is PhysicsBody {
  return "rigidBody" in value;
}

/**
 * Camera-relative drive controller for a dynamic Rapier sphere.
 *
 * It only applies impulses and torque during normal play. Visual transforms
 * should instead be read from the rigid body after a physics step.
 */
export class BallController {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly config: BallPhysicsConfig;

  private checkpointPosition: Vector3Like;
  private checkpointRotation: QuaternionLike;
  private respawnRemainingMs = 0;
  private respawning = false;
  private lastGroundNormal: Vector3Like = { ...UP };
  private lastSurface: Readonly<SurfaceMaterialDefinition> = getSurfaceMaterial();
  private enabled = true;
  private jumpCooldownRemaining = 0;
  private jumpedThisStep = false;
  private lastState: BallControllerState;

  constructor(
    private readonly physics: PhysicsWorld,
    body: PhysicsBody | RigidBody,
    options: BallControllerOptions = {}
  ) {
    this.body = isPhysicsBody(body) ? body.rigidBody : body;
    this.collider = options.collider ?? (isPhysicsBody(body) ? body.collider : body.collider(0));
    this.config = createBallPhysicsConfig(options.config);
    if (options.config?.radius === undefined) {
      this.config.radius = this.collider.radius();
    }
    this.checkpointPosition = clone(options.spawnPosition ?? this.physics.getBodyTranslation(this.body));
    this.checkpointRotation = {
      ...(options.spawnRotation ?? this.physics.getBodyRotation(this.body))
    };
    this.onFall = options.onFall;
    this.onRespawn = options.onRespawn;
    this.lastState = this.makeState();
  }

  private readonly onFall?: () => void;
  private readonly onRespawn?: (position: Vector3Like) => void;

  get state(): BallControllerState {
    return {
      ...this.lastState,
      groundNormal: clone(this.lastState.groundNormal)
    };
  }

  get isGrounded(): boolean {
    return this.lastState.grounded;
  }

  get isRespawning(): boolean {
    return this.respawning;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setCheckpoint(position: Vector3Like, rotation: QuaternionLike = IDENTITY): void {
    this.checkpointPosition = clone(position);
    this.checkpointRotation = { ...rotation };
  }

  /** Explicitly begins the configurable delayed checkpoint recovery. */
  requestRespawn(delayMs = this.config.respawnDelayMs): void {
    if (this.respawning) {
      return;
    }

    this.respawning = true;
    this.respawnRemainingMs = Math.max(0, delayMs);
  }

  /** Immediately restores a clean physical state at a checkpoint or supplied pose. */
  respawn(position = this.checkpointPosition, rotation = this.checkpointRotation): void {
    this.body.setTranslation(clone(position), true);
    this.body.setRotation({ ...rotation }, true);
    this.body.setLinvel({ ...ZERO }, true);
    this.body.setAngvel({ ...ZERO }, true);
    this.body.wakeUp();
    this.respawning = false;
    this.respawnRemainingMs = 0;
    this.lastGroundNormal = { ...UP };
    this.lastSurface = getSurfaceMaterial();
    this.jumpCooldownRemaining = 0;
    this.jumpedThisStep = false;
    this.lastState = this.makeState();
    this.onRespawn?.(clone(position));
  }

  /**
   * Applies input before the simulation step. `cameraForward` and
   * `cameraRight` may be Three.Vector3 instances or any x/y/z-like objects.
   */
  update(
    deltaSeconds: number,
    inputAxis: InputAxis,
    cameraForward: Vector3Like,
    cameraRight: Vector3Like,
    flags: BallControlFlags = {}
  ): BallControllerState {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    this.jumpedThisStep = false;
    this.jumpCooldownRemaining = Math.max(0, this.jumpCooldownRemaining - delta);
    this.updateGroundState();
    this.lastState = this.makeState();
    const grounded = this.lastState.grounded;

    if (flags.reset) {
      this.respawn();
      return this.state;
    }

    if (this.body.translation().y < this.config.fallHeight) {
      const wasRespawning = this.respawning;
      this.requestRespawn();
      if (!wasRespawning) {
        this.onFall?.();
      }
    }

    if (this.respawning) {
      this.respawnRemainingMs -= delta * 1000;
      if (this.respawnRemainingMs <= 0) {
        this.respawn();
      }
      this.lastState = this.makeState();
      return this.state;
    }

    const acceptsInput = this.enabled && (flags.enabled ?? true);
    if (flags.jump && acceptsInput && grounded && this.jumpCooldownRemaining <= 0) {
      this.applyJump();
    }
    const desiredDirection = acceptsInput
      ? this.getCameraRelativeDirection(inputAxis, cameraForward, cameraRight)
      : null;
    const surfaceGameplay = this.lastSurface.gameplay;

    if (desiredDirection) {
      const controlMultiplier = grounded ? 1 : this.config.airControlMultiplier;
      const precisionMultiplier = flags.precision ? 0.58 : 1;
      const boostMultiplier = flags.boost && !flags.precision ? this.config.boostMultiplier : 1;
      const tractionMultiplier = surfaceGameplay?.tractionMultiplier ?? 1;
      // A rolling sphere needs normal × direction torque. Reversing this
      // order makes the sphere roll opposite to the camera-relative input.
      const torqueAxis = cross(this.lastGroundNormal, desiredDirection);
      const torque = multiply(
        torqueAxis,
        this.config.accelerationTorque *
          controlMultiplier *
          precisionMultiplier *
          boostMultiplier *
          tractionMultiplier *
          delta
      );
      this.body.applyTorqueImpulse(torque, true);

      this.applyGentleLateralStabilization(desiredDirection, delta);
    }

    if (flags.brake && grounded) {
      this.applyBrake(delta, surfaceGameplay?.brakingMultiplier ?? 1);
    }

    this.limitVelocities(
      (surfaceGameplay?.maxSpeedMultiplier ?? 1) *
        (flags.boost && !flags.precision ? this.config.boostMultiplier : 1)
    );
    this.lastState = this.makeState();
    return this.state;
  }

  private updateGroundState(): void {
    const hit = this.physics.probeGround(this.body.translation(), this.config.radius, this.collider);
    if (hit?.grounded) {
      this.lastGroundNormal = clone(hit.normal);
      this.lastSurface = hit.surface;
      return;
    }

    this.lastGroundNormal = { ...UP };
    this.lastSurface = getSurfaceMaterial();
  }

  private getCameraRelativeDirection(
    inputAxis: InputAxis,
    cameraForward: Vector3Like,
    cameraRight: Vector3Like
  ): Vector3Like | null {
    const inputLength = Math.hypot(inputAxis.x, inputAxis.y);
    if (inputLength < 0.001) {
      return null;
    }

    const forward = normalize({ x: cameraForward.x, y: 0, z: cameraForward.z });
    const right = normalize({ x: cameraRight.x, y: 0, z: cameraRight.z });
    if (!forward || !right) {
      return null;
    }

    const inputScale = 1 / Math.max(1, inputLength);
    const flatDirection = normalize({
      x: (right.x * inputAxis.x + forward.x * inputAxis.y) * inputScale,
      y: 0,
      z: (right.z * inputAxis.x + forward.z * inputAxis.y) * inputScale
    });
    if (!flatDirection) {
      return null;
    }

    // Remove the component pointing into a slope before computing rolling torque.
    const projected = subtract(
      flatDirection,
      multiply(this.lastGroundNormal, dot(flatDirection, this.lastGroundNormal))
    );
    return normalize(projected);
  }

  private applyBrake(delta: number, surfaceMultiplier: number): void {
    const velocity = this.body.linvel();
    const normalVelocity = multiply(this.lastGroundNormal, dot(velocity, this.lastGroundNormal));
    const tangentVelocity = subtract(velocity, normalVelocity);
    const impulse = multiply(
      tangentVelocity,
      -this.body.mass() * this.config.brakeStrength * surfaceMultiplier * delta
    );
    this.body.applyImpulse(impulse, true);

    const angularVelocity = this.body.angvel();
    this.body.applyTorqueImpulse(
      multiply(angularVelocity, -this.config.brakeStrength * surfaceMultiplier * delta * 0.16),
      true
    );
  }

  private applyJump(): void {
    const normalVelocity = dot(this.body.linvel(), this.lastGroundNormal);
    const velocityChange = Math.max(0, this.config.jumpVelocity - normalVelocity);
    if (velocityChange <= 0.0001) {
      return;
    }

    this.body.applyImpulse(multiply(this.lastGroundNormal, this.body.mass() * velocityChange), true);
    this.body.wakeUp();
    this.jumpCooldownRemaining = this.config.jumpCooldownSeconds;
    this.jumpedThisStep = true;
  }

  private applyGentleLateralStabilization(desiredDirection: Vector3Like, delta: number): void {
    if (!this.lastState.grounded) {
      return;
    }

    const velocity = this.body.linvel();
    const horizontalVelocity = { x: velocity.x, y: 0, z: velocity.z };
    const horizontalSpeed = magnitude(horizontalVelocity);
    if (horizontalSpeed > this.config.maxLinearSpeed * 0.42) {
      return;
    }

    const forwardComponent = multiply(desiredDirection, dot(horizontalVelocity, desiredDirection));
    const lateralVelocity = subtract(horizontalVelocity, forwardComponent);
    this.body.applyImpulse(multiply(lateralVelocity, -this.body.mass() * delta * 0.7), true);
  }

  private limitVelocities(speedMultiplier: number): void {
    const maximumLinear = this.config.maxLinearSpeed * speedMultiplier;
    const linearVelocity = this.body.linvel();
    const linearSpeed = magnitude(linearVelocity);
    if (linearSpeed > maximumLinear) {
      this.body.setLinvel(multiply(linearVelocity, maximumLinear / linearSpeed), true);
    }

    const angularVelocity = this.body.angvel();
    const angularSpeed = magnitude(angularVelocity);
    if (angularSpeed > this.config.maxAngularSpeed) {
      this.body.setAngvel(multiply(angularVelocity, this.config.maxAngularSpeed / angularSpeed), true);
    }
  }

  private makeState(): BallControllerState {
    const linearSpeed = magnitude(this.body.linvel());
    const angularSpeed = magnitude(this.body.angvel());
    const groundHit = this.physics.probeGround(this.body.translation(), this.config.radius, this.collider);
    const grounded = groundHit?.grounded ?? false;
    return {
      grounded,
      groundNormal: clone(groundHit?.normal ?? this.lastGroundNormal),
      surface: groundHit?.surface ?? this.lastSurface,
      linearSpeed,
      angularSpeed,
      isRespawning: this.respawning,
      jumped: this.jumpedThisStep
    };
  }
}
