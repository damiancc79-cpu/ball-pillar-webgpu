import { ColliderDesc, RigidBodyDesc, type Collider, type RigidBody } from "@dimforge/rapier3d-compat";
import { Object3D, Quaternion, Vector3 } from "three";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { getSurfaceMaterial, type SurfaceMaterialId } from "../physics/SurfaceMaterial";

export interface PushableObjectOptions {
  id: string;
  visual: Object3D;
  position: Vector3;
  halfExtents: Vector3;
  mass?: number;
  surface?: SurfaceMaterialId;
}

/** Dynamic crates, barrels, and counterweights all share this body/visual/reset pattern. */
export class PushableObject {
  readonly body: RigidBody;
  readonly collider: Collider;
  private readonly spawn: Vector3;
  private readonly rotation = new Quaternion();

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly options: PushableObjectOptions
  ) {
    this.spawn = options.position.clone();
    const surface = getSurfaceMaterial(options.surface ?? "rusted-metal");
    this.body = physics.world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(options.position.x, options.position.y, options.position.z)
        .setLinearDamping(0.26)
        .setAngularDamping(0.32)
        .setCcdEnabled(true)
        .setUserData({ id: options.id, kind: "pushable" })
    );
    this.collider = physics.world.createCollider(
      ColliderDesc.cuboid(options.halfExtents.x, options.halfExtents.y, options.halfExtents.z)
        .setMass(options.mass ?? 3)
        .setFriction(surface.friction)
        .setRestitution(surface.restitution),
      this.body
    );
  }

  get position(): Vector3 {
    const translation = this.body.translation();
    return new Vector3(translation.x, translation.y, translation.z);
  }

  update(): void {
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    this.options.visual.position.set(translation.x, translation.y, translation.z);
    this.rotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.options.visual.quaternion.copy(this.rotation);
  }

  reset(): void {
    this.body.setTranslation(this.spawn, true);
    this.body.setRotation(new Quaternion(), true);
    this.body.setLinvel(new Vector3(), true);
    this.body.setAngvel(new Vector3(), true);
  }

  dispose(): void {
    this.physics.world.removeRigidBody(this.body);
  }
}
