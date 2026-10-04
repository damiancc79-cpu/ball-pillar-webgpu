import {
  AmbientLight,
  BufferGeometry,
  BoxGeometry,
  Color,
  DirectionalLight,
  Euler,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3
} from "three";
import type { AudioLoopHandle, AudioManager } from "../audio/AudioManager";
import type { MusicSystem } from "../audio/MusicSystem";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";
import { KinematicBox } from "../gameplay/KinematicBox";
import { FeedbackParticles } from "../gameplay/FeedbackParticles";
import { LaunchPad } from "../gameplay/LaunchPad";
import { MovingPlatform } from "../gameplay/MovingPlatform";
import { Pendulum } from "../gameplay/Pendulum";
import { PressureSwitch } from "../gameplay/PressureSwitch";
import { PushableObject } from "../gameplay/PushableObject";
import { RotatingBeam } from "../gameplay/RotatingBeam";
import { Seesaw } from "../gameplay/Seesaw";
import { LevelBuilder, type LevelRuntime, type StaticBoxRequest } from "../level/LevelBuilder";
import {
  PILLAR_WORKS_LEVEL,
  type LevelDefinition,
  type TutorialAdvanceTrigger,
  type TutorialStepDefinition
} from "../level/LevelDefinition";
import { BallController, type BallControlFlags, type InputAxis } from "../player/BallController";
import { BallVisual } from "../player/BallVisual";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import type { SurfaceMaterialInput } from "../physics/SurfaceMaterial";
import { createRetroMaterial } from "../shaders/retroNodes";

export interface GameSceneInput {
  move: InputAxis;
  lookX: number;
  lookY: number;
  gamepadLook?: boolean;
  brake: boolean;
  boost: boolean;
  jump: boolean;
  precision: boolean;
  recenter: boolean;
}

export interface GameSceneCallbacks {
  onCheckpoint?: (name: string) => void;
  onFall?: () => void;
  onRespawn?: () => void;
  onGoal?: () => void;
  onSwitch?: (active: boolean) => void;
  onTutorial?: (step: TutorialStepDefinition | undefined, index: number, total: number) => void;
}

export interface GameSceneOptions {
  level?: LevelDefinition;
  audio?: AudioManager;
  music?: MusicSystem;
  callbacks?: GameSceneCallbacks;
}

export interface GameMetrics {
  speed: number;
  surface: string;
  checkpoint: string;
  physicsBodies: number;
  sleepingBodies: number;
}

export interface GameTuningPatch {
  gravity?: number;
  ballMass?: number;
  accelerationTorque?: number;
  airControlMultiplier?: number;
  brakeStrength?: number;
  boostMultiplier?: number;
  maxLinearSpeed?: number;
  friction?: number;
  restitution?: number;
  cameraDistance?: number;
  cameraSmoothing?: number;
  cameraCollisionMargin?: number;
  fogDensity?: number;
}

const EMPTY_INPUT: GameSceneInput = {
  move: { x: 0, y: 0 },
  lookX: 0,
  lookY: 0,
  brake: false,
  boost: false,
  jump: false,
  precision: false,
  recenter: false
};

const staticRotation = new Euler();
const staticQuaternion = new Quaternion();

function materialFor(
  surface: SurfaceMaterialInput
): MeshStandardMaterial | ReturnType<typeof createRetroMaterial> {
  switch (surface) {
    case "energy":
      return new MeshStandardMaterial({
        color: "#ffbd5a",
        emissive: "#c84d10",
        emissiveIntensity: 1.45,
        metalness: 0.5,
        roughness: 0.26
      });
    case "polished-metal":
    case "polishedMetal":
      return createRetroMaterial("#38475f", 0.28, 0.92);
    case "rubber":
      return createRetroMaterial("#302a34", 0.7, 0.03);
    default:
      return createRetroMaterial("#71442d", 0.82, 0.5);
  }
}

function makeBoxVisual(name: string, position: Vector3, size: Vector3, surface: SurfaceMaterialInput): Group {
  const group = new Group();
  group.name = name;
  group.position.copy(position);
  const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z), materialFor(surface));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function makePendulumVisual(): Group {
  const root = new Group();
  const bob = new Mesh(new SphereGeometry(0.68, 10, 8), createRetroMaterial("#4d5667", 0.25, 0.94));
  bob.castShadow = true;
  root.add(bob);
  return root;
}

/** Dispose a scene's owned mesh resources before dropping the scene graph. */
function disposeSceneResources(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** A playable campaign course. Rendering is physically synchronized but game input never teleports the ball. */
export class GameScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(57, 4 / 3, 0.1, 220);
  readonly physics: PhysicsWorld;
  readonly ball: BallController;
  readonly ballVisual: BallVisual;
  readonly chaseCamera: ThirdPersonCamera;
  readonly level: LevelRuntime;
  readonly definition: LevelDefinition;

  private readonly audio?: AudioManager;
  private readonly music?: MusicSystem;
  private readonly callbacks: GameSceneCallbacks;
  private readonly movingPlatforms: MovingPlatform[] = [];
  private readonly rotatingBeams: RotatingBeam[] = [];
  private readonly pendulums: Pendulum[] = [];
  private readonly pushables: PushableObject[] = [];
  private readonly bridge?: KinematicBox;
  private readonly bridgeVisual?: Group;
  private readonly seesaw?: Seesaw;
  private readonly pressureSwitch?: PressureSwitch;
  private readonly launchPads: LaunchPad[] = [];
  private readonly particles: FeedbackParticles;
  private readonly physicsDebug = new Group();
  private readonly debugBall: Mesh;
  private unsubscribeAudioUnlock: (() => void) | undefined;
  private collisionUnsubscribe: (() => void) | undefined;
  private rollingLoop: AudioLoopHandle | undefined;
  private rollingSurface = "";
  private activeCheckpoint = 0;
  private elapsed = 0;
  private input: GameSceneInput = EMPTY_INPUT;
  private pendingJump = false;
  private tutorialStepIndex = 0;
  private bridgeRaised = false;
  private completed = false;
  private staticBodyCount = 0;

  private constructor(physics: PhysicsWorld, options: GameSceneOptions) {
    this.physics = physics;
    this.definition = options.level ?? PILLAR_WORKS_LEVEL;
    this.audio = options.audio;
    this.music = options.music;
    this.callbacks = options.callbacks ?? {};
    this.scene.background = new Color("#8491b1");
    this.scene.fog = new FogExp2("#8491b1", 0.022);
    this.camera.position.set(-7, 13, 10);

    this.scene.add(new AmbientLight("#8292bb", 1.15));
    const key = new DirectionalLight("#ffab5e", 2.7);
    key.position.set(-20, 24, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const fill = new PointLight("#ee7438", 16, 24, 2);
    fill.position.set(34, 10, 5);
    this.scene.add(fill);
    this.particles = new FeedbackParticles();
    this.scene.add(this.particles.points);

    const builder = new LevelBuilder();
    this.level = builder.build(
      this.scene,
      {
        addStaticBox: (request) => this.addStaticCollider(request)
      },
      this.definition
    );
    for (const checkpoint of this.level.checkpoints) {
      this.addSensorBox(`checkpoint-${checkpoint.id}`, checkpoint.position, checkpoint.radius, "energy");
    }
    this.addSensorBox("goal-portal", this.level.goalPosition, this.level.goalRadius, "energy");

    const ballBody = physics.createDynamicBall({
      position: new Vector3(...this.definition.spawn),
      surface: "polished-metal",
      config: { fallHeight: -18 }
    });
    this.ball = new BallController(physics, ballBody, {
      spawnPosition: new Vector3(...this.definition.spawn),
      onFall: () => {
        this.audio?.playNoise({ bus: "sfx", duration: 0.24, gain: 0.13, filterFrequency: 280 });
        this.callbacks.onFall?.();
      },
      onRespawn: () => {
        this.pushables.forEach((pushable) => pushable.reset());
        this.chaseCamera.snapTo(
          this.physics.getBodyTranslation(this.ball.body),
          this.physics.getBodyLinearVelocity(this.ball.body)
        );
        this.audio?.playTone({ bus: "sfx", frequency: 168, duration: 0.22, gain: 0.12, type: "sine" });
        this.callbacks.onRespawn?.();
      }
    });
    this.ballVisual = new BallVisual({ radius: this.ball.config.radius });
    this.scene.add(this.ballVisual.root);
    this.debugBall = new Mesh(
      new SphereGeometry(this.ball.config.radius * 1.025, 12, 8),
      new MeshBasicMaterial({
        color: "#68e6ff",
        wireframe: true,
        transparent: true,
        opacity: 0.8,
        depthTest: false
      })
    );
    this.physicsDebug.add(this.debugBall);
    this.physicsDebug.visible = false;
    this.scene.add(this.physicsDebug);

    this.chaseCamera = new ThirdPersonCamera(this.camera);
    this.chaseCamera.setCollisionQuery(physics, ballBody.collider);
    this.chaseCamera.snapTo(physics.getBodyTranslation(ballBody));
    this.unsubscribeAudioUnlock = this.audio?.onUnlocked(() => this.updateRollingAudio("concrete", 0, true));
    this.collisionUnsubscribe = physics.onCollision((event) => {
      if (!event.started || (event.colliderA !== ballBody.collider && event.colliderB !== ballBody.collider))
        return;
      const position = this.physics.getBodyTranslation(this.ball.body);
      this.particles.emit(
        new Vector3(position.x, position.y - this.ball.config.radius, position.z),
        "#ffbd67",
        5,
        1.8
      );
      this.chaseCamera.addShake(0.055);
      this.audio?.playNoise({
        bus: "sfx",
        duration: 0.055,
        gain: 0.055,
        filterFrequency: 1100,
        volumeVariation: 0.16
      });
    });

    if (this.definition.mechanics === "turbine-spine") {
      this.buildTurbineSpineMechanisms();
    }

    if (this.definition.mechanics === "pillar-works") {
      this.buildPillarWorksMechanisms();
      const switchMaterial = new MeshStandardMaterial({
        color: "#52252b",
        emissive: "#220508",
        emissiveIntensity: 0.25,
        metalness: 0.5,
        roughness: 0.38
      });
      const switchVisual = new Mesh(new BoxGeometry(1.55, 0.2, 1.55), switchMaterial);
      switchVisual.position.set(77, 7.12, 1.9);
      switchVisual.castShadow = true;
      this.scene.add(switchVisual);
      this.addSensorBox("counterweight-switch", switchVisual.position, 1.25, "energy", 0.35);
      const bridgeVisual = makeBoxVisual(
        "counterweight-bridge",
        new Vector3(86, 3.3, -0.5),
        new Vector3(7, 0.65, 2),
        "rusted-metal"
      );
      this.scene.add(bridgeVisual);
      const bridge = new KinematicBox(physics, {
        id: "counterweight-bridge",
        position: bridgeVisual.position,
        size: new Vector3(7, 0.65, 2),
        surface: "rusted-metal"
      });
      this.bridgeVisual = bridgeVisual;
      this.bridge = bridge;

      const seesaw = this.createSeesaw();
      this.seesaw = seesaw;
      this.pressureSwitch = new PressureSwitch({
        id: "counterweight-switch",
        position: switchVisual.position,
        radius: 1.25,
        requiredHoldSeconds: 0.18,
        onChanged: (active) => {
          this.bridgeRaised = active;
          seesaw.setCounterweightEngaged(active);
          switchMaterial.color.set(active ? "#ff583f" : "#52252b");
          switchMaterial.emissive.set(active ? "#a9120a" : "#220508");
          switchMaterial.emissiveIntensity = active ? 2 : 0.25;
          this.particles.emit(
            switchVisual.position,
            active ? "#ff6949" : "#68414a",
            active ? 14 : 5,
            active ? 2.8 : 1.4
          );
          this.audio?.playTone({
            bus: "sfx",
            frequency: active ? 682 : 204,
            duration: 0.12,
            gain: 0.12,
            type: "square"
          });
          if (active) this.music?.cueSuccess();
          this.callbacks.onSwitch?.(active);
        }
      });
      this.launchPads.push(
        new LaunchPad({
          position: new Vector3(42.5, 6.2, -0.5),
          radius: 1.65,
          impulse: new Vector3(8.5, 7.2, 0),
          cooldownSeconds: 1.2
        })
      );
    }
  }

  static async create(options: GameSceneOptions = {}): Promise<GameScene> {
    const physics = await PhysicsWorld.create();
    return new GameScene(physics, options);
  }

  setInput(input: GameSceneInput): void {
    this.input = input;
    this.pendingJump ||= input.jump;
  }

  /** Receives the HUD's touch/pointer jump action without depending on a frame edge. */
  requestJump(): void {
    this.pendingJump = true;
  }

  start(): void {
    this.completed = false;
    this.tutorialStepIndex = 0;
    this.ball.setEnabled(true);
    this.music?.setPaused(false);
    this.music?.setState("exploration");
    this.music?.start();
    this.publishTutorialStep();
  }

  pause(paused: boolean): void {
    this.ball.setEnabled(!paused);
    this.music?.setPaused(paused);
    if (paused) this.rollingLoop?.setGain(0, 0.08);
  }

  resetToCheckpoint(): void {
    this.pendingJump = false;
    const checkpoint = this.level.checkpoints[this.activeCheckpoint];
    this.ball.respawn(checkpoint.position);
  }

  restart(): void {
    this.activeCheckpoint = 0;
    this.bridgeRaised = false;
    this.completed = false;
    this.pushables.forEach((pushable) => pushable.reset());
    this.resetToCheckpoint();
  }

  applyTuning(patch: GameTuningPatch): void {
    if (typeof patch.gravity === "number") this.physics.world.gravity.y = patch.gravity;
    if (typeof patch.ballMass === "number") this.ball.collider.setMass(patch.ballMass);
    if (typeof patch.accelerationTorque === "number")
      this.ball.config.accelerationTorque = patch.accelerationTorque;
    if (typeof patch.airControlMultiplier === "number")
      this.ball.config.airControlMultiplier = patch.airControlMultiplier;
    if (typeof patch.brakeStrength === "number") this.ball.config.brakeStrength = patch.brakeStrength;
    if (typeof patch.boostMultiplier === "number") this.ball.config.boostMultiplier = patch.boostMultiplier;
    if (typeof patch.maxLinearSpeed === "number") this.ball.config.maxLinearSpeed = patch.maxLinearSpeed;
    if (typeof patch.friction === "number") this.ball.collider.setFriction(patch.friction);
    if (typeof patch.restitution === "number") this.ball.collider.setRestitution(patch.restitution);
    if (typeof patch.cameraDistance === "number") this.chaseCamera.config.distance = patch.cameraDistance;
    if (typeof patch.cameraSmoothing === "number") {
      this.chaseCamera.config.positionSmoothness = patch.cameraSmoothing;
      this.chaseCamera.config.rotationSmoothness = patch.cameraSmoothing;
    }
    if (typeof patch.cameraCollisionMargin === "number")
      this.chaseCamera.config.collisionMargin = patch.cameraCollisionMargin;
    if (typeof patch.fogDensity === "number" && this.scene.fog instanceof FogExp2)
      this.scene.fog.density = patch.fogDensity;
  }

  spawnTestObject(): void {
    const spawn = new Vector3(
      this.ball.body.translation().x,
      this.ball.body.translation().y + 2.2,
      this.ball.body.translation().z
    );
    const visual = makeBoxVisual(
      `test-crate-${this.pushables.length}`,
      spawn,
      new Vector3(0.8, 0.8, 0.8),
      "sand-coated-metal"
    );
    this.scene.add(visual);
    this.pushables.push(
      new PushableObject(this.physics, {
        id: `test-crate-${this.pushables.length}`,
        visual,
        position: spawn,
        halfExtents: new Vector3(0.4, 0.4, 0.4),
        mass: 1.7,
        surface: "sand-coated-metal"
      })
    );
  }

  setPhysicsDebugVisible(visible: boolean): void {
    this.physicsDebug.visible = visible;
  }

  get physicsDebugVisible(): boolean {
    return this.physicsDebug.visible;
  }

  stepPhysics(delta: number): void {
    if (this.completed) {
      this.pendingJump = false;
      return;
    }
    this.elapsed += delta;
    this.updateMechanisms(delta);
    const jump = this.pendingJump;
    this.pendingJump = false;
    const flags: BallControlFlags = {
      brake: this.input.brake,
      boost: this.input.boost,
      jump,
      precision: this.input.precision
    };
    const state = this.ball.update(
      delta,
      this.input.move,
      this.chaseCamera.forward,
      this.chaseCamera.right,
      flags
    );
    this.advanceTutorialFromInput(state.jumped);
    this.updateRollingAudio(state.surface.id, state.linearSpeed, state.grounded);
    this.physics.stepFixed();
    this.pushables.forEach((pushable) => pushable.update());

    const ballPosition = this.physics.getBodyTranslation(this.ball.body);
    const ballVector = new Vector3(ballPosition.x, ballPosition.y, ballPosition.z);
    if (state.jumped) {
      this.particles.emit(
        new Vector3(ballPosition.x, ballPosition.y - this.ball.config.radius, ballPosition.z),
        "#ffe08a",
        7,
        1.5
      );
      this.chaseCamera.addShake(0.025);
      this.audio?.playTone({ bus: "sfx", frequency: 360, duration: 0.075, gain: 0.08, type: "triangle" });
    }
    this.updateCheckpoints(ballVector);
    this.launchPads.forEach((launchPad) => {
      launchPad.update(delta, ballVector, (impulse) => {
        this.ball.body.applyImpulse(impulse, true);
        this.audio?.playNoise({ bus: "sfx", duration: 0.14, gain: 0.15, filterFrequency: 760 });
        this.particles.emit(
          new Vector3(ballPosition.x, ballPosition.y - this.ball.config.radius, ballPosition.z),
          "#ffe590",
          14,
          3.6
        );
        this.chaseCamera.addShake(0.13);
      });
    });
    this.music?.update({
      speed: state.linearSpeed,
      maxSpeed: this.ball.config.maxLinearSpeed,
      risk: ballPosition.y > 11
    });
    this.checkGoal(ballVector);
  }

  updateVisuals(delta: number, elapsed: number): void {
    const state = this.ball.state;
    this.ballVisual.syncFromRigidBody(this.ball.body);
    this.ballVisual.setBoosting(this.input.boost);
    this.ballVisual.setGrounded(state.grounded);
    this.ballVisual.setSurface(state.surface.id);
    this.ballVisual.update(elapsed, state.linearSpeed);
    this.chaseCamera.update(
      delta,
      this.physics.getBodyTranslation(this.ball.body),
      this.physics.getBodyLinearVelocity(this.ball.body),
      {
        lookX: this.input.lookX,
        lookY: this.input.lookY,
        gamepad: this.input.gamepadLook,
        precision: this.input.precision,
        recenter: this.input.recenter
      }
    );
    this.level.update(elapsed);
    this.particles.update(delta);
    this.debugBall.position.copy(this.ballVisual.root.position);
  }

  get metrics(): GameMetrics {
    const state = this.ball.state;
    return {
      speed: state.linearSpeed,
      surface: state.surface.label,
      checkpoint: this.level.checkpoints[this.activeCheckpoint].name,
      physicsBodies:
        this.staticBodyCount +
        this.pushables.length +
        this.movingPlatforms.length +
        this.rotatingBeams.length +
        this.pendulums.length +
        (this.definition.mechanics === "pillar-works" ? 3 : 1),
      sleepingBodies: this.pushables.filter((pushable) => pushable.body.isSleeping()).length
    };
  }

  dispose(): void {
    this.pushables.forEach((pushable) => pushable.dispose());
    this.collisionUnsubscribe?.();
    this.unsubscribeAudioUnlock?.();
    this.rollingLoop?.stop();
    this.particles.dispose();
    this.debugBall.geometry.dispose();
    (this.debugBall.material as MeshBasicMaterial).dispose();
    this.physicsDebug.removeFromParent();
    this.ballVisual.dispose();
    disposeSceneResources(this.scene);
    this.physics.dispose();
    this.scene.clear();
  }

  private addStaticCollider(request: StaticBoxRequest): void {
    staticRotation.set(request.rotation.x, request.rotation.y, request.rotation.z);
    staticQuaternion.setFromEuler(staticRotation);
    this.physics.createStaticBox({
      position: request.position,
      halfExtents: request.size.clone().multiplyScalar(0.5),
      rotation: staticQuaternion,
      surface: request.surface,
      userData: { id: request.id, kind: "level" }
    });
    this.staticBodyCount += 1;
  }

  private addSensorBox(
    id: string,
    position: Vector3,
    radius: number,
    surface: SurfaceMaterialInput,
    verticalHalfExtent = 1.5
  ): void {
    this.physics.createStaticBox({
      position,
      halfExtents: new Vector3(radius, verticalHalfExtent, radius),
      surface,
      sensor: true,
      userData: { id, kind: "trigger" }
    });
    this.staticBodyCount += 1;
  }

  /** Advanced-course mechanisms: a timed transfer, broad rotor, swing gate, and optional boost route. */
  private buildTurbineSpineMechanisms(): void {
    const liftVisual = makeBoxVisual(
      "spine-transfer-lift",
      new Vector3(51, 1.65, 0),
      new Vector3(6, 0.55, 8),
      "rusted-metal"
    );
    this.scene.add(liftVisual);
    this.movingPlatforms.push(
      new MovingPlatform(this.physics, {
        id: "spine-transfer-lift",
        origin: liftVisual.position,
        size: new Vector3(6, 0.55, 8),
        axis: new Vector3(1, 0, 0),
        travel: 4.3,
        speed: 0.64,
        visual: liftVisual
      })
    );

    const rotorVisual = makeBoxVisual(
      "spine-rotor-arm",
      new Vector3(85, 2.35, 0),
      new Vector3(8.8, 0.45, 0.72),
      "rusted-metal"
    );
    this.scene.add(rotorVisual);
    this.rotatingBeams.push(
      new RotatingBeam(this.physics, {
        id: "spine-rotor-arm",
        position: rotorVisual.position,
        size: new Vector3(8.8, 0.45, 0.72),
        speed: 1.05,
        phase: 0.25,
        visual: rotorVisual
      })
    );

    const pendulumVisual = makePendulumVisual();
    pendulumVisual.position.set(134, 10.6, 0);
    this.scene.add(pendulumVisual);
    this.pendulums.push(
      new Pendulum(this.physics, {
        id: "spine-swing-gate",
        pivot: new Vector3(134, 10.6, 0),
        length: 4.2,
        speed: 1.35,
        visual: pendulumVisual
      })
    );

    const serviceCarriageVisual = makeBoxVisual(
      "spine-service-carriage",
      new Vector3(176, 7.6, 7),
      new Vector3(5, 0.55, 4),
      "rusted-metal"
    );
    this.scene.add(serviceCarriageVisual);
    this.movingPlatforms.push(
      new MovingPlatform(this.physics, {
        id: "spine-service-carriage",
        origin: serviceCarriageVisual.position,
        size: new Vector3(5, 0.55, 4),
        axis: new Vector3(0, 0, 1),
        travel: 2.2,
        speed: 1.1,
        visual: serviceCarriageVisual
      })
    );

    // Authored as a raw Rapier impulse (the ball is 4.5 mass), so a rolling boost
    // carries the player across the high vault while the moving service route stays viable.
    this.launchPads.push(
      new LaunchPad({
        position: new Vector3(164, 7.15, 0),
        radius: 1.65,
        impulse: new Vector3(42, 50, 0),
        cooldownSeconds: 1.25
      })
    );
  }

  private buildPillarWorksMechanisms(): void {
    const moverVisual = makeBoxVisual(
      "cargo-lift",
      new Vector3(57, 5.9, -0.5),
      new Vector3(4.2, 0.55, 3),
      "rusted-metal"
    );
    this.scene.add(moverVisual);
    this.movingPlatforms.push(
      new MovingPlatform(this.physics, {
        id: "cargo-lift",
        origin: moverVisual.position,
        size: new Vector3(4.2, 0.55, 3),
        axis: new Vector3(1, 0, 0),
        travel: 4.1,
        speed: 0.75,
        visual: moverVisual
      })
    );

    const armVisual = makeBoxVisual(
      "rotor-arm",
      new Vector3(61, 7.8, -0.5),
      new Vector3(9, 0.45, 0.75),
      "rusted-metal"
    );
    this.scene.add(armVisual);
    this.rotatingBeams.push(
      new RotatingBeam(this.physics, {
        id: "rotor-arm",
        position: armVisual.position,
        size: new Vector3(9, 0.45, 0.75),
        speed: 0.72,
        phase: 0.5,
        visual: armVisual
      })
    );

    const pendulumVisual = makePendulumVisual();
    pendulumVisual.position.set(67, 12, 2.8);
    this.scene.add(pendulumVisual);
    this.pendulums.push(
      new Pendulum(this.physics, {
        id: "piston-pendulum",
        pivot: new Vector3(67, 12, 2.8),
        length: 4.1,
        speed: 1.15,
        visual: pendulumVisual
      })
    );

    const crateVisual = makeBoxVisual(
      "counterweight-crate",
      new Vector3(71, 8.7, 1.6),
      new Vector3(1.15, 1.15, 1.15),
      "rusted-metal"
    );
    this.scene.add(crateVisual);
    this.pushables.push(
      new PushableObject(this.physics, {
        id: "counterweight-crate",
        visual: crateVisual,
        position: crateVisual.position,
        halfExtents: new Vector3(0.575, 0.575, 0.575),
        mass: 4.8
      })
    );

    const barrelVisual = new Group();
    const barrel = new Mesh(new SphereGeometry(0.46, 10, 8), materialFor("polished-metal"));
    barrelVisual.add(barrel);
    barrelVisual.position.set(74, 8.3, -2.2);
    this.scene.add(barrelVisual);
    this.pushables.push(
      new PushableObject(this.physics, {
        id: "counterweight-orb",
        visual: barrelVisual,
        position: barrelVisual.position,
        halfExtents: new Vector3(0.46, 0.46, 0.46),
        mass: 2.8,
        surface: "polished-metal"
      })
    );
  }

  private createSeesaw(): Seesaw {
    const visual = makeBoxVisual(
      "seesaw",
      new Vector3(74, 7.5, -2),
      new Vector3(5, 0.42, 1.45),
      "rusted-metal"
    );
    this.scene.add(visual);
    return new Seesaw(this.physics, {
      id: "seesaw",
      position: visual.position,
      size: new Vector3(5, 0.42, 1.45),
      visual
    });
  }

  private updateMechanisms(delta: number): void {
    this.movingPlatforms.forEach((platform) => platform.update(this.elapsed));
    this.rotatingBeams.forEach((beam) => beam.update(this.elapsed));
    this.pendulums.forEach((pendulum) => pendulum.update(this.elapsed));
    if (!this.pressureSwitch || !this.bridge || !this.bridgeVisual || !this.seesaw) {
      return;
    }
    const weightPositions = this.pushables.map((pushable) => pushable.position);
    weightPositions.push(
      new Vector3(
        this.ball.body.translation().x,
        this.ball.body.translation().y,
        this.ball.body.translation().z
      )
    );
    this.pressureSwitch.update(delta, weightPositions);
    const targetY = this.bridgeRaised ? 8.8 : 3.3;
    const next = this.bridge.position.clone();
    next.y += (targetY - next.y) * Math.min(1, delta * 1.85);
    this.bridge.setTransform(next, this.bridge.rotation);
    this.bridgeVisual.position.copy(this.bridge.position);
    this.bridgeVisual.quaternion.copy(this.bridge.quaternion);
    this.seesaw.update(delta);
  }

  private updateCheckpoints(position: Vector3): void {
    for (let index = this.activeCheckpoint + 1; index < this.level.checkpoints.length; index += 1) {
      const checkpoint = this.level.checkpoints[index];
      if (position.distanceToSquared(checkpoint.position) <= checkpoint.radius * checkpoint.radius) {
        this.activeCheckpoint = index;
        this.ball.setCheckpoint(checkpoint.position);
        checkpoint.visual.children.forEach((child) => child.scale.setScalar(1.25));
        this.particles.emit(checkpoint.position, "#ffcb65", 20, 3.4);
        this.chaseCamera.addShake(0.08);
        this.audio?.playTone({ bus: "ui", frequency: 820, duration: 0.13, gain: 0.12, type: "triangle" });
        this.music?.cueSuccess();
        this.callbacks.onCheckpoint?.(checkpoint.name);
        this.advanceTutorial("checkpoint");
      }
    }
  }

  private checkGoal(position: Vector3): void {
    if (
      this.completed ||
      position.distanceToSquared(this.level.goalPosition) > this.level.goalRadius * this.level.goalRadius
    )
      return;
    this.completed = true;
    this.ball.setEnabled(false);
    this.particles.emit(this.level.goalPosition, "#fff0a0", 42, 4.5);
    this.chaseCamera.addShake(0.22);
    this.music?.update({ completed: true });
    this.audio?.playTone({ bus: "ui", frequency: 1046, duration: 0.34, gain: 0.17, type: "sawtooth" });
    this.advanceTutorial("goal");
    this.callbacks.onGoal?.();
  }

  private advanceTutorialFromInput(jumped: boolean): void {
    const step = this.definition.tutorial?.[this.tutorialStepIndex];
    if (!step) {
      return;
    }

    if (step.advanceOn === "move" && Math.hypot(this.input.move.x, this.input.move.y) > 0.12) {
      this.advanceTutorial("move");
    } else if (step.advanceOn === "jump" && jumped) {
      this.advanceTutorial("jump");
    } else if (step.advanceOn === "brake" && this.input.brake) {
      this.advanceTutorial("brake");
    }
  }

  private advanceTutorial(trigger: TutorialAdvanceTrigger): void {
    const step = this.definition.tutorial?.[this.tutorialStepIndex];
    if (!step || step.advanceOn !== trigger) {
      return;
    }

    this.tutorialStepIndex += 1;
    this.publishTutorialStep();
  }

  private publishTutorialStep(): void {
    const steps = this.definition.tutorial ?? [];
    this.callbacks.onTutorial?.(steps[this.tutorialStepIndex], this.tutorialStepIndex, steps.length);
  }

  private updateRollingAudio(surface: string, speed: number, grounded: boolean): void {
    if (!this.audio?.isUnlocked) return;
    if (!this.rollingLoop || this.rollingSurface !== surface) {
      this.rollingLoop?.stop(0.05);
      const filterFrequency =
        surface === "ice" ? 1750 : surface === "rubber" ? 360 : surface === "polished-metal" ? 1250 : 760;
      this.rollingLoop = this.audio.createNoiseLoop({
        bus: "sfx",
        gain: 0,
        filterFrequency,
        filterType: surface === "rubber" ? "lowpass" : "bandpass"
      });
      this.rollingSurface = surface;
    }
    const normalized = Math.min(1, speed / this.ball.config.maxLinearSpeed);
    this.rollingLoop?.setGain(grounded ? normalized * 0.075 : 0.001, 0.05);
    this.rollingLoop?.setPlaybackRate(0.55 + normalized * 1.15, 0.05);
  }
}
