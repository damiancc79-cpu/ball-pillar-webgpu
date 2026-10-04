import { Euler, Quaternion, Vector3 } from "three";
import type { PhysicsBody, PhysicsWorld } from "../physics/PhysicsWorld";
import type { SurfaceMaterialInput } from "../physics/SurfaceMaterial";

export interface KinematicBoxOptions {
  id: string;
  position: Vector3;
  size: Vector3;
  surface: SurfaceMaterialInput;
}

export class KinematicBox {
  readonly body: PhysicsBody;
  readonly position: Vector3;
  readonly rotation = new Euler();
  readonly quaternion = new Quaternion();

  constructor(
    protected readonly physics: PhysicsWorld,
    options: KinematicBoxOptions
  ) {
    this.position = options.position.clone();
    this.body = physics.createKinematicBox({
      position: this.position,
      halfExtents: options.size.clone().multiplyScalar(0.5),
      surface: options.surface,
      userData: { id: options.id, kind: "kinematic" }
    });
  }

  setTransform(position: Vector3, rotation: Euler): void {
    this.position.copy(position);
    this.rotation.copy(rotation);
    this.quaternion.setFromEuler(this.rotation);
    this.physics.setKinematicTranslation(this.body, this.position);
    this.physics.setKinematicRotation(this.body, this.quaternion);
  }
}
