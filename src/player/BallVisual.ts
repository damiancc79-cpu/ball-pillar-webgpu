import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  TorusGeometry,
  SphereGeometry,
  type Material
} from "three";

import type { QuaternionLike, Vector3Like } from "../config/PhysicsConfig";
import { getSurfaceMaterial, type SurfaceMaterialInput } from "../physics/SurfaceMaterial";

export interface BallVisualOptions {
  radius?: number;
  color?: number | string;
  highlightColor?: number | string;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface RigidBodyTransformSource {
  translation(): Vector3Like;
  rotation(): QuaternionLike;
  linvel?(): Vector3Like;
}

/**
 * Low-poly-adjacent metallic ball art. The body transform stays on the rolling
 * group so the contact disc remains level while the physical sphere spins.
 */
export class BallVisual {
  readonly root = new Group();
  readonly rollingGroup = new Group();
  readonly mesh: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  readonly contactShadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly radius: number;

  private readonly shellMaterial: MeshPhysicalMaterial;
  private readonly glowMaterial: MeshBasicMaterial;
  private readonly materials: Material[];
  private boosting = false;
  private grounded = true;
  private elapsed = 0;

  constructor(options: BallVisualOptions = {}) {
    this.radius = options.radius ?? 0.58;
    this.root.name = "PlayerBall";
    this.rollingGroup.name = "PlayerBallRollingShell";
    this.root.add(this.rollingGroup);

    this.shellMaterial = new MeshPhysicalMaterial({
      color: options.color ?? 0x151b31,
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.82,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.45
    });
    this.mesh = new Mesh(new SphereGeometry(this.radius, 28, 18), this.shellMaterial);
    this.mesh.name = "PlayerBallShell";
    this.mesh.castShadow = options.castShadow ?? true;
    this.mesh.receiveShadow = options.receiveShadow ?? true;
    this.rollingGroup.add(this.mesh);

    const equatorMaterial = new MeshPhysicalMaterial({
      color: 0x313a61,
      metalness: 1,
      roughness: 0.27,
      clearcoat: 0.45
    });
    const equator = new Mesh(
      new TorusGeometry(this.radius * 1.006, this.radius * 0.033, 6, 28),
      equatorMaterial
    );
    equator.rotation.x = Math.PI / 2;
    this.rollingGroup.add(equator);

    this.glowMaterial = new MeshBasicMaterial({
      color: options.highlightColor ?? 0xffe37e,
      transparent: true,
      opacity: 0.84,
      blending: AdditiveBlending,
      depthWrite: false
    });
    const glint = new Mesh(new SphereGeometry(this.radius * 0.17, 10, 8), this.glowMaterial);
    glint.position.set(this.radius * 0.16, this.radius * 0.22, this.radius * 0.5);
    this.rollingGroup.add(glint);

    const shadowMaterial = new MeshBasicMaterial({
      color: 0x080a13,
      transparent: true,
      opacity: 0.32,
      depthWrite: false
    });
    this.contactShadow = new Mesh(new CircleGeometry(this.radius * 0.88, 18), shadowMaterial);
    this.contactShadow.name = "PlayerBallContactShadow";
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = -this.radius * 0.98;
    this.root.add(this.contactShadow);
    this.materials = [this.shellMaterial, equatorMaterial, this.glowMaterial, shadowMaterial];
  }

  /** Copies the physics pose without directly controlling it. */
  sync(position: Vector3Like, rotation: QuaternionLike): void {
    this.root.position.set(position.x, position.y, position.z);
    this.rollingGroup.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  syncFromRigidBody(source: RigidBodyTransformSource): void {
    this.sync(source.translation(), source.rotation());
    const velocity = source.linvel?.();
    if (velocity) {
      this.update(0, Math.hypot(velocity.x, velocity.y, velocity.z));
    }
  }

  setBoosting(active: boolean): void {
    this.boosting = active;
    this.refreshEffects();
  }

  setGrounded(grounded: boolean): void {
    this.grounded = grounded;
    this.refreshEffects();
  }

  /** Tints the tiny core glint with the active traversal surface. */
  setSurface(surface: SurfaceMaterialInput | string | null | undefined): void {
    const appearance = getSurfaceMaterial(surface).appearance;
    const color = new Color(appearance.emissive ?? appearance.color);
    color.lerp(new Color(0xffdf76), 0.58);
    this.glowMaterial.color.copy(color);
  }

  update(deltaSeconds: number, linearSpeed = 0): void {
    // A restrained pulse keeps the late-console core readable at a distance.
    this.elapsed += Math.max(0, deltaSeconds);
    const pulse = 0.74 + Math.sin(this.elapsed * 9 + linearSpeed * 0.16) * 0.09;
    this.glowMaterial.opacity = Math.min(
      1,
      pulse + (this.boosting ? 0.2 : 0) + Math.min(linearSpeed / 70, 0.08)
    );
    this.contactShadow.scale.setScalar(this.grounded ? 1 : 0.52);
    this.contactShadow.material.opacity = this.grounded ? 0.32 : 0.1;
    // Purely visual squash keeps hard landings tactile without touching Rapier's sphere collider.
    const squash = this.grounded ? Math.min(0.045, linearSpeed * 0.002) : 0;
    this.mesh.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.contactShadow.geometry.dispose();
    for (const child of this.rollingGroup.children) {
      if (child instanceof Mesh && child !== this.mesh) {
        child.geometry.dispose();
      }
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.root.removeFromParent();
  }

  private refreshEffects(): void {
    this.glowMaterial.opacity = this.boosting ? 1 : 0.84;
    this.contactShadow.material.opacity = this.grounded ? 0.32 : 0.1;
  }
}
