import RAPIER, {
  ActiveEvents,
  ColliderDesc,
  RigidBodyDesc,
  type Collider,
  type RigidBody
} from "@dimforge/rapier3d-compat";

import {
  createBallPhysicsConfig,
  createPhysicsWorldConfig,
  type BallPhysicsConfig,
  type PhysicsWorldConfig,
  type QuaternionLike,
  type Vector3Like
} from "../config/PhysicsConfig";
import {
  applySurfaceMaterialToCollider,
  getSurfaceMaterial,
  type SurfaceMaterialDefinition,
  type SurfaceMaterialInput,
  type SurfaceMaterialId
} from "./SurfaceMaterial";

export type { QuaternionLike, Vector3Like } from "../config/PhysicsConfig";

export interface PhysicsBody {
  /** Short alias intended for game code. */
  body: RigidBody;
  /** Explicit alias that reads better in rendering synchronization code. */
  rigidBody: RigidBody;
  collider: Collider;
  surface: SurfaceMaterialId;
}

export interface PhysicsBodyOptions {
  position: Vector3Like;
  rotation?: QuaternionLike;
  surface?: SurfaceMaterialInput | string;
  friction?: number;
  restitution?: number;
  sensor?: boolean;
  collisionGroups?: number;
  userData?: unknown;
}

export interface BoxBodyOptions extends PhysicsBodyOptions {
  halfExtents: Vector3Like;
}

export interface DynamicBallOptions extends PhysicsBodyOptions {
  radius?: number;
  config?: Partial<BallPhysicsConfig>;
  /** Extra solver passes for tight beams and heavy moving mechanisms. */
  additionalSolverIterations?: number;
}

export interface PhysicsRaycastOptions {
  excludeCollider?: Collider;
  excludeRigidBody?: RigidBody;
  includeSensors?: boolean;
  predicate?: (collider: Collider) => boolean;
}

export interface PhysicsRaycastHit {
  collider: Collider;
  distance: number;
  point: Vector3Like;
  normal: Vector3Like;
  surface: Readonly<SurfaceMaterialDefinition>;
}

export interface GroundProbeResult extends PhysicsRaycastHit {
  grounded: boolean;
}

export interface PhysicsCollisionEvent {
  colliderA: Collider;
  colliderB: Collider;
  started: boolean;
}

export interface PhysicsStepResult {
  steps: number;
  interpolationAlpha: number;
  discardedTime: boolean;
}

type CollisionListener = (event: PhysicsCollisionEvent) => void;

interface ColliderMetadata {
  surface: SurfaceMaterialId;
  userData?: unknown;
}

const IDENTITY_ROTATION: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };
const DOWN: Vector3Like = { x: 0, y: -1, z: 0 };

function cloneVector(vector: Vector3Like): Vector3Like {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function asRigidBody(body: PhysicsBody | RigidBody): RigidBody {
  return "rigidBody" in body ? body.rigidBody : body;
}

function vectorLength(vector: Vector3Like): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vector3Like): Vector3Like | null {
  const length = vectorLength(vector);
  if (length < 0.000001) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

/**
 * Small Rapier ownership wrapper. It owns the wasm world, tracks gameplay
 * surface metadata Rapier colliders cannot store themselves, and performs a
 * bounded accumulator step suitable for a requestAnimationFrame loop.
 */
export class PhysicsWorld {
  readonly config: PhysicsWorldConfig;

  private rawWorld: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;
  private initialization: Promise<this> | null = null;
  private accumulator = 0;
  private readonly colliderMetadata = new Map<number, ColliderMetadata>();
  private readonly collisionListeners = new Set<CollisionListener>();

  constructor(config: Partial<PhysicsWorldConfig> = {}) {
    this.config = createPhysicsWorldConfig(config);
  }

  /** Creates and initializes a ready-to-use world in one awaitable call. */
  static async create(config: Partial<PhysicsWorldConfig> = {}): Promise<PhysicsWorld> {
    const physics = new PhysicsWorld(config);
    await physics.initialize();
    return physics;
  }

  /**
   * Rapier compat must initialize its wasm module before World construction.
   * Calling this repeatedly is safe and always resolves to the same instance.
   */
  initialize(): Promise<this> {
    if (this.rawWorld) {
      return Promise.resolve(this);
    }

    if (!this.initialization) {
      this.initialization = this.initializeWorld();
    }

    return this.initialization;
  }

  get isReady(): boolean {
    return this.rawWorld !== null;
  }

  /** The underlying Rapier world for advanced joints, queries, and debug use. */
  get world(): RAPIER.World {
    return this.requireWorld();
  }

  createStaticBox(options: BoxBodyOptions): PhysicsBody;
  createStaticBox(
    position: Vector3Like,
    halfExtents: Vector3Like,
    options?: Omit<BoxBodyOptions, "position" | "halfExtents">
  ): PhysicsBody;
  createStaticBox(
    positionOrOptions: Vector3Like | BoxBodyOptions,
    maybeHalfExtents?: Vector3Like,
    maybeOptions: Omit<BoxBodyOptions, "position" | "halfExtents"> = {}
  ): PhysicsBody {
    const options = this.resolveBoxOptions(positionOrOptions, maybeHalfExtents, maybeOptions);
    return this.createBox("fixed", options);
  }

  createKinematicBox(options: BoxBodyOptions): PhysicsBody;
  createKinematicBox(
    position: Vector3Like,
    halfExtents: Vector3Like,
    options?: Omit<BoxBodyOptions, "position" | "halfExtents">
  ): PhysicsBody;
  createKinematicBox(
    positionOrOptions: Vector3Like | BoxBodyOptions,
    maybeHalfExtents?: Vector3Like,
    maybeOptions: Omit<BoxBodyOptions, "position" | "halfExtents"> = {}
  ): PhysicsBody {
    const options = this.resolveBoxOptions(positionOrOptions, maybeHalfExtents, maybeOptions);
    return this.createBox("kinematic", options);
  }

  /** Creates the dynamic, CCD-enabled spherical body used by the player. */
  createDynamicBall(options: DynamicBallOptions): PhysicsBody {
    const world = this.requireWorld();
    const config = createBallPhysicsConfig(options.config);
    const rotation = options.rotation ?? IDENTITY_ROTATION;
    const material = getSurfaceMaterial(options.surface);
    const friction =
      options.friction ?? (options.surface === undefined ? config.defaultFriction : material.friction);
    const restitution =
      options.restitution ?? (options.surface === undefined ? config.restitution : material.restitution);
    const surface = material.id;

    const bodyDescription = RigidBodyDesc.dynamic()
      .setTranslation(options.position.x, options.position.y, options.position.z)
      .setRotation(rotation)
      .setLinearDamping(config.linearDamping)
      .setAngularDamping(config.angularDamping)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(config.radius * 0.5)
      .setAdditionalSolverIterations(options.additionalSolverIterations ?? 2);

    if (options.userData !== undefined) {
      bodyDescription.setUserData(options.userData);
    }

    const rigidBody = world.createRigidBody(bodyDescription);
    const colliderDescription = ColliderDesc.ball(options.radius ?? config.radius)
      .setMass(config.mass)
      .setFriction(friction)
      .setRestitution(restitution)
      .setSensor(options.sensor ?? false)
      .setActiveEvents(ActiveEvents.COLLISION_EVENTS | ActiveEvents.CONTACT_FORCE_EVENTS);

    if (options.collisionGroups !== undefined) {
      colliderDescription.setCollisionGroups(options.collisionGroups);
    }

    const collider = world.createCollider(colliderDescription, rigidBody);
    this.colliderMetadata.set(collider.handle, {
      surface,
      userData: options.userData
    });

    return { body: rigidBody, rigidBody, collider, surface };
  }

  /** Alias for callers that prefer a more concise factory name. */
  createBall(options: DynamicBallOptions): PhysicsBody {
    return this.createDynamicBall(options);
  }

  /**
   * Accumulates real frame time, with a cap to prevent an inactive tab from
   * producing a giant burst of simulation work when it resumes.
   */
  step(deltaSeconds = this.config.fixedTimestep): PhysicsStepResult {
    const safeDelta = Math.max(0, Math.min(deltaSeconds, this.config.maxFrameDelta));
    this.accumulator += safeDelta;

    let steps = 0;
    while (this.accumulator >= this.config.fixedTimestep && steps < this.config.maxSubSteps) {
      this.stepFixed();
      this.accumulator -= this.config.fixedTimestep;
      steps += 1;
    }

    const discardedTime = steps === this.config.maxSubSteps && this.accumulator >= this.config.fixedTimestep;
    if (discardedTime) {
      this.accumulator = 0;
    }

    return {
      steps,
      interpolationAlpha: this.accumulator / this.config.fixedTimestep,
      discardedTime
    };
  }

  /** Performs exactly one configured fixed-time physics step. */
  stepFixed(): void {
    const world = this.requireWorld();
    world.step(this.eventQueue ?? undefined);
    this.drainCollisionEvents();
  }

  getBodyTranslation(body: PhysicsBody | RigidBody): Vector3Like {
    return cloneVector(asRigidBody(body).translation());
  }

  getBodyRotation(body: PhysicsBody | RigidBody): QuaternionLike {
    const rotation = asRigidBody(body).rotation();
    return {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w
    };
  }

  getBodyLinearVelocity(body: PhysicsBody | RigidBody): Vector3Like {
    return cloneVector(asRigidBody(body).linvel());
  }

  setKinematicTranslation(body: PhysicsBody | RigidBody, position: Vector3Like): void {
    asRigidBody(body).setNextKinematicTranslation(cloneVector(position));
  }

  setKinematicRotation(body: PhysicsBody | RigidBody, rotation: QuaternionLike): void {
    asRigidBody(body).setNextKinematicRotation({ ...rotation });
  }

  setSurfaceMaterial(
    collider: Collider,
    material: SurfaceMaterialInput | string
  ): Readonly<SurfaceMaterialDefinition> {
    const resolved = getSurfaceMaterial(material);
    applySurfaceMaterialToCollider(collider, resolved);
    const previous = this.colliderMetadata.get(collider.handle);
    this.colliderMetadata.set(collider.handle, {
      ...previous,
      surface: resolved.id
    });
    return resolved;
  }

  getSurfaceMaterial(collider: Collider | null | undefined): Readonly<SurfaceMaterialDefinition> {
    if (!collider) {
      return getSurfaceMaterial();
    }

    return getSurfaceMaterial(this.colliderMetadata.get(collider.handle)?.surface);
  }

  getColliderUserData(collider: Collider): unknown {
    return this.colliderMetadata.get(collider.handle)?.userData;
  }

  castRay(
    origin: Vector3Like,
    direction: Vector3Like,
    maxDistance: number,
    options: PhysicsRaycastOptions = {}
  ): PhysicsRaycastHit | null {
    const normalizedDirection = normalize(direction);
    if (!normalizedDirection || maxDistance <= 0) {
      return null;
    }

    const world = this.requireWorld();
    const ray = new RAPIER.Ray(cloneVector(origin), normalizedDirection);
    const hit = world.castRayAndGetNormal(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      options.excludeCollider,
      options.excludeRigidBody,
      (collider) =>
        ((options.includeSensors ?? false) || !collider.isSensor()) && (options.predicate?.(collider) ?? true)
    );

    if (!hit) {
      return null;
    }

    return {
      collider: hit.collider,
      distance: hit.timeOfImpact,
      point: {
        x: origin.x + normalizedDirection.x * hit.timeOfImpact,
        y: origin.y + normalizedDirection.y * hit.timeOfImpact,
        z: origin.z + normalizedDirection.z * hit.timeOfImpact
      },
      normal: cloneVector(hit.normal),
      surface: this.getSurfaceMaterial(hit.collider)
    };
  }

  probeGround(
    position: Vector3Like,
    radius: number,
    excludeCollider?: Collider,
    probePadding = 0.12,
    minimumNormalY = 0.35
  ): GroundProbeResult | null {
    const hit = this.castRay(position, DOWN, radius + probePadding, {
      excludeCollider
    });

    if (!hit) {
      return null;
    }

    return { ...hit, grounded: hit.normal.y >= minimumNormalY };
  }

  onCollision(listener: CollisionListener): () => void {
    this.collisionListeners.add(listener);
    return () => this.collisionListeners.delete(listener);
  }

  dispose(): void {
    this.eventQueue?.free();
    this.eventQueue = null;
    this.rawWorld?.free();
    this.rawWorld = null;
    this.accumulator = 0;
    this.colliderMetadata.clear();
    this.collisionListeners.clear();
    this.initialization = null;
  }

  private async initializeWorld(): Promise<this> {
    await RAPIER.init();

    const world = new RAPIER.World(cloneVector(this.config.gravity));
    world.timestep = this.config.fixedTimestep;
    world.numSolverIterations = this.config.solverIterations;
    world.maxCcdSubsteps = this.config.ccdSubsteps;

    this.rawWorld = world;
    this.eventQueue = new RAPIER.EventQueue(true);
    return this;
  }

  private requireWorld(): RAPIER.World {
    if (!this.rawWorld) {
      throw new Error("PhysicsWorld is not initialized. Await PhysicsWorld.create() or initialize() first.");
    }

    return this.rawWorld;
  }

  private resolveBoxOptions(
    positionOrOptions: Vector3Like | BoxBodyOptions,
    maybeHalfExtents: Vector3Like | undefined,
    maybeOptions: Omit<BoxBodyOptions, "position" | "halfExtents">
  ): BoxBodyOptions {
    if ("halfExtents" in positionOrOptions) {
      return positionOrOptions;
    }

    if (!maybeHalfExtents) {
      throw new Error("A box collider requires halfExtents.");
    }

    return {
      ...maybeOptions,
      position: positionOrOptions,
      halfExtents: maybeHalfExtents
    };
  }

  private createBox(bodyType: "fixed" | "kinematic", options: BoxBodyOptions): PhysicsBody {
    const world = this.requireWorld();
    const rotation = options.rotation ?? IDENTITY_ROTATION;
    const material = getSurfaceMaterial(options.surface);
    const surface = material.id;
    const bodyDescription =
      bodyType === "fixed" ? RigidBodyDesc.fixed() : RigidBodyDesc.kinematicPositionBased();

    bodyDescription
      .setTranslation(options.position.x, options.position.y, options.position.z)
      .setRotation(rotation);
    if (options.userData !== undefined) {
      bodyDescription.setUserData(options.userData);
    }

    const rigidBody = world.createRigidBody(bodyDescription);
    const colliderDescription = ColliderDesc.cuboid(
      options.halfExtents.x,
      options.halfExtents.y,
      options.halfExtents.z
    )
      .setFriction(options.friction ?? material.friction)
      .setRestitution(options.restitution ?? material.restitution)
      .setSensor(options.sensor ?? false)
      .setActiveEvents(ActiveEvents.COLLISION_EVENTS);
    if (options.collisionGroups !== undefined) {
      colliderDescription.setCollisionGroups(options.collisionGroups);
    }

    const collider = world.createCollider(colliderDescription, rigidBody);
    this.colliderMetadata.set(collider.handle, {
      surface,
      userData: options.userData
    });

    return { body: rigidBody, rigidBody, collider, surface };
  }

  private drainCollisionEvents(): void {
    if (!this.eventQueue || this.collisionListeners.size === 0) {
      return;
    }

    const world = this.requireWorld();
    this.eventQueue.drainCollisionEvents((handleA, handleB, started) => {
      const colliderA = world.getCollider(handleA);
      const colliderB = world.getCollider(handleB);
      if (!colliderA || !colliderB) {
        return;
      }

      const event: PhysicsCollisionEvent = { colliderA, colliderB, started };
      for (const listener of this.collisionListeners) {
        listener(event);
      }
    });
  }
}
