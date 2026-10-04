import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { Collider } from "@dimforge/rapier3d-compat";

import type { Vector3Like } from "../config/PhysicsConfig";

export interface ThirdPersonCameraConfig {
  distance: number;
  minDistance: number;
  maxDistance: number;
  height: number;
  targetHeight: number;
  pitch: number;
  minPitch: number;
  maxPitch: number;
  positionSmoothness: number;
  rotationSmoothness: number;
  movementAlignSpeed: number;
  movementAlignThreshold: number;
  speedDistanceGain: number;
  speedFovGain: number;
  baseFov: number;
  collisionMargin: number;
  turnTilt: number;
  mouseSensitivity: number;
  gamepadSensitivity: number;
}

export interface CameraInput {
  /** Horizontal mouse delta or normalized right-stick axis. */
  lookX?: number;
  /** Vertical mouse delta or normalized right-stick axis. */
  lookY?: number;
  /** Mark right-stick values as per-second axes instead of pointer deltas. */
  gamepad?: boolean;
  recenter?: boolean;
  precision?: boolean;
}

export interface CameraCollisionHit {
  distance: number;
}

export interface CameraRaycastOptions {
  /** Player collider to ignore when the cast originates at the player. */
  excludeCollider?: Collider;
}

/** Compatible with PhysicsWorld.castRay and custom spatial query adapters. */
export interface CameraCollisionQuery {
  castRay(
    origin: Vector3Like,
    direction: Vector3Like,
    maxDistance: number,
    options?: CameraRaycastOptions
  ): CameraCollisionHit | number | null;
}

const DEFAULT_CAMERA_CONFIG: Readonly<ThirdPersonCameraConfig> = Object.freeze({
  // A high 3/4 follow view keeps the next beam, landing area, and surrounding
  // vertical structure readable instead of framing the ball at ground level.
  distance: 15.5,
  // This remains low so collision recovery can move inside nearby ceilings or beams.
  minDistance: 1.5,
  maxDistance: 18,
  // Keep the entire offset distance-based. That makes the collision ray and
  // the returned scalar distance agree instead of leaving a fixed-height clip.
  height: 0,
  targetHeight: 0.42,
  pitch: 1.04,
  minPitch: 0.78,
  maxPitch: 1.18,
  positionSmoothness: 7.5,
  rotationSmoothness: 10,
  movementAlignSpeed: 1.85,
  movementAlignThreshold: 2,
  speedDistanceGain: 0.04,
  speedFovGain: 0.22,
  baseFov: 55,
  collisionMargin: 0.4,
  turnTilt: 0,
  mouseSensitivity: 0.0031,
  gamepadSensitivity: 2.15
});

const ZERO = new Vector3();

function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  return current + shortestAngle(current, target) * (1 - Math.exp(-lambda * delta));
}

function toVector3(value: Vector3Like, target: Vector3): Vector3 {
  return target.set(value.x, value.y, value.z);
}

/**
 * A focused gameplay camera: input only adjusts desired yaw/pitch while the
 * camera itself smoothly chases a ball and can be pulled forward by geometry.
 */
export class ThirdPersonCamera {
  readonly config: ThirdPersonCameraConfig;

  // A PerspectiveCamera is intentional here: Camera.lookAt() aims its local
  // negative Z axis at the target, whereas Object3D.lookAt() aims positive Z.
  // Using a generic Object3D would make the gameplay camera flip toward the sky
  // as soon as the first follow update interpolated its rotation.
  private readonly lookAnchor = new PerspectiveCamera();
  private readonly desiredPosition = new Vector3();
  private readonly targetAnchor = new Vector3();
  private readonly direction = new Vector3();
  private readonly desiredQuaternion = new Quaternion();
  private readonly rollQuaternion = new Quaternion();
  private readonly movement = new Vector3();
  private readonly shakeOffset = new Vector3();
  private collisionQuery: CameraCollisionQuery | null = null;
  private collisionExclusion: Collider | undefined;
  private queuedInput: CameraInput = {};
  private yaw = 0;
  private pitch: number;
  private recenterRequested = false;
  private precisionMode = false;
  private currentDistance: number;
  private elapsed = 0;
  private shake = 0;
  private manualLookRemaining = 0;

  constructor(
    readonly camera: PerspectiveCamera,
    config: Partial<ThirdPersonCameraConfig> = {}
  ) {
    this.config = { ...DEFAULT_CAMERA_CONFIG, ...config };
    this.pitch = this.config.pitch;
    this.currentDistance = this.config.distance;
    this.camera.fov = this.config.baseFov;
    this.camera.updateProjectionMatrix();
  }

  setCollisionQuery(query: CameraCollisionQuery | null, excludeCollider?: Collider): void {
    this.collisionQuery = query;
    this.collisionExclusion = excludeCollider;
  }

  /** Queues one input sample for the next update; pointer samples are consumed once. */
  setDesiredInput(input: CameraInput): void {
    this.queuedInput = { ...input };
  }

  setInput(input: CameraInput): void {
    this.setDesiredInput(input);
  }

  applyLookDelta(horizontal: number, vertical: number): void {
    this.yaw -= horizontal * this.config.mouseSensitivity;
    this.pitch = MathUtils.clamp(
      this.pitch - vertical * this.config.mouseSensitivity,
      this.config.minPitch,
      this.config.maxPitch
    );
  }

  requestRecenter(): void {
    this.recenterRequested = true;
  }

  /** Immediately re-centers the aerial rig after spawning or checkpoint recovery. */
  snapTo(target: Vector3Like, movementVelocity: Vector3Like = ZERO): void {
    this.targetAnchor.copy(toVector3(target, this.targetAnchor));
    this.targetAnchor.y += this.config.targetHeight;
    this.movement.copy(toVector3(movementVelocity, this.movement));
    const planarSpeed = Math.hypot(this.movement.x, this.movement.z);
    this.yaw =
      planarSpeed > this.config.movementAlignThreshold ? Math.atan2(-this.movement.x, -this.movement.z) : 0;
    this.pitch = this.config.pitch;
    this.precisionMode = false;
    this.recenterRequested = false;
    this.manualLookRemaining = 0;
    this.currentDistance = this.resolveCollisionDistance(this.config.distance);
    const horizontalDistance = Math.cos(this.pitch) * this.currentDistance;
    this.camera.position.set(
      this.targetAnchor.x + Math.sin(this.yaw) * horizontalDistance,
      this.targetAnchor.y + Math.sin(this.pitch) * this.currentDistance,
      this.targetAnchor.z + Math.cos(this.yaw) * horizontalDistance
    );
    this.camera.lookAt(this.targetAnchor);
    this.camera.fov = this.config.baseFov;
    this.camera.updateProjectionMatrix();
  }

  /** Brief, restrained visual-only jolt for impacts and machinery feedback. */
  addShake(strength: number): void {
    this.shake = Math.min(0.45, Math.max(this.shake, Math.max(0, strength)));
  }

  get forward(): Vector3 {
    return this.camera.getWorldDirection(new Vector3());
  }

  get right(): Vector3 {
    return new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
  }

  /**
   * Updates camera position, rotation, and FOV after physics synchronization.
   * `target` can be a Three.Vector3 or an unadorned x/y/z physics value.
   */
  update(
    deltaSeconds: number,
    target: Vector3Like,
    movementVelocity: Vector3Like = ZERO,
    input?: CameraInput
  ): void {
    const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
    this.elapsed += delta;
    if (input) {
      this.setDesiredInput(input);
    }
    const manualLookThisFrame = this.consumeInput(delta);

    this.targetAnchor.copy(toVector3(target, this.targetAnchor));
    this.targetAnchor.y += this.config.targetHeight;
    this.movement.copy(toVector3(movementVelocity, this.movement));
    const planarSpeed = Math.hypot(this.movement.x, this.movement.z);

    if (planarSpeed > this.config.movementAlignThreshold && !this.recenterRequested && !manualLookThisFrame) {
      // Position the camera opposite travel, behind the rolling ball.
      const movementYaw = Math.atan2(-this.movement.x, -this.movement.z);
      this.yaw = dampAngle(this.yaw, movementYaw, this.config.movementAlignSpeed, delta);
    }

    if (this.recenterRequested) {
      if (planarSpeed > this.config.movementAlignThreshold) {
        this.yaw = dampAngle(
          this.yaw,
          Math.atan2(-this.movement.x, -this.movement.z),
          this.config.rotationSmoothness,
          delta
        );
      }
      this.pitch = MathUtils.damp(this.pitch, this.config.pitch, this.config.rotationSmoothness, delta);
      if (Math.abs(this.pitch - this.config.pitch) < 0.001) {
        this.recenterRequested = false;
      }
    }

    const speedDistance = Math.min(
      this.config.maxDistance - this.config.distance,
      planarSpeed * this.config.speedDistanceGain
    );
    // Narrow routes retain the aerial angle but pull in slightly for edge clarity.
    const precisionDistance = this.precisionMode ? -1.15 : 0;
    const nominalDistance = MathUtils.clamp(
      this.config.distance + speedDistance + precisionDistance,
      this.config.minDistance,
      this.config.maxDistance
    );
    const safeDistance = this.resolveCollisionDistance(nominalDistance);
    const collisionPullIn = safeDistance < this.currentDistance - 0.001;
    this.currentDistance = collisionPullIn
      ? safeDistance
      : MathUtils.damp(this.currentDistance, safeDistance, this.config.positionSmoothness, delta);

    const horizontalDistance = Math.cos(this.pitch) * this.currentDistance;
    this.desiredPosition.set(
      this.targetAnchor.x + Math.sin(this.yaw) * horizontalDistance,
      this.targetAnchor.y + this.config.height + Math.sin(this.pitch) * this.currentDistance,
      this.targetAnchor.z + Math.cos(this.yaw) * horizontalDistance
    );
    if (this.shake > 0.0005) {
      const amount = this.shake;
      this.shakeOffset.set(
        Math.sin(this.elapsed * 71) * amount,
        Math.cos(this.elapsed * 97) * amount * 0.72,
        Math.sin(this.elapsed * 53) * amount * 0.42
      );
      this.desiredPosition.add(this.shakeOffset);
      this.shake *= Math.exp(-delta * 15);
    } else {
      this.shake = 0;
    }

    if (collisionPullIn) {
      this.camera.position.copy(this.desiredPosition);
    } else {
      const positionAlpha = 1 - Math.exp(-this.config.positionSmoothness * delta);
      this.camera.position.lerp(this.desiredPosition, positionAlpha);
    }

    this.lookAnchor.position.copy(this.camera.position);
    this.lookAnchor.lookAt(this.targetAnchor);
    this.desiredQuaternion.copy(this.lookAnchor.quaternion);
    const lateralSpeed = this.movement.x * Math.cos(this.yaw) - this.movement.z * Math.sin(this.yaw);
    const roll = MathUtils.clamp(
      -lateralSpeed * this.config.turnTilt * 0.08,
      -this.config.turnTilt,
      this.config.turnTilt
    );
    this.rollQuaternion.setFromAxisAngle(new Vector3(0, 0, 1), roll);
    this.desiredQuaternion.multiply(this.rollQuaternion);
    this.camera.quaternion.slerp(
      this.desiredQuaternion,
      1 - Math.exp(-this.config.rotationSmoothness * delta)
    );

    const desiredFov = this.config.baseFov + Math.min(7, planarSpeed * this.config.speedFovGain);
    this.camera.fov = MathUtils.damp(this.camera.fov, desiredFov, this.config.rotationSmoothness, delta);
    this.camera.updateProjectionMatrix();
  }

  private consumeInput(delta: number): boolean {
    const input = this.queuedInput;
    const hadManualLook = Math.abs(input.lookX ?? 0) > 0.0001 || Math.abs(input.lookY ?? 0) > 0.0001;
    this.manualLookRemaining = hadManualLook ? 0.6 : Math.max(0, this.manualLookRemaining - delta);
    const sensitivity = input.gamepad ? this.config.gamepadSensitivity * delta : this.config.mouseSensitivity;
    this.yaw -= (input.lookX ?? 0) * sensitivity;
    this.pitch = MathUtils.clamp(
      this.pitch - (input.lookY ?? 0) * sensitivity,
      this.config.minPitch,
      this.config.maxPitch
    );
    this.precisionMode = input.precision ?? this.precisionMode;
    this.recenterRequested ||= input.recenter ?? false;

    // Pointer deltas should not repeat if a rendering frame arrives without input.
    this.queuedInput = input.gamepad ? { ...input, recenter: false } : { precision: this.precisionMode };
    return this.manualLookRemaining > 0;
  }

  private resolveCollisionDistance(nominalDistance: number): number {
    if (!this.collisionQuery) {
      return nominalDistance;
    }

    // Build the ray directly because desiredPosition is calculated later this frame.
    const horizontalDistance = Math.cos(this.pitch) * nominalDistance;
    this.direction.set(
      Math.sin(this.yaw) * horizontalDistance,
      this.config.height + Math.sin(this.pitch) * nominalDistance,
      Math.cos(this.yaw) * horizontalDistance
    );
    const maxDistance = this.direction.length();
    if (maxDistance < 0.001) {
      return nominalDistance;
    }

    this.direction.multiplyScalar(1 / maxDistance);
    const hit = this.collisionQuery.castRay(this.targetAnchor, this.direction, maxDistance, {
      excludeCollider: this.collisionExclusion
    });
    if (hit === null) {
      return nominalDistance;
    }

    const hitDistance = typeof hit === "number" ? hit : hit.distance;
    if (!Number.isFinite(hitDistance) || hitDistance >= maxDistance) {
      return nominalDistance;
    }

    // Convert camera-ray distance into the radius-like distance used above.
    const scale = nominalDistance / maxDistance;
    return MathUtils.clamp(
      (hitDistance - this.config.collisionMargin) * scale,
      this.config.minDistance,
      nominalDistance
    );
  }
}
