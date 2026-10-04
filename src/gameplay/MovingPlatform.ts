import { Group, Vector3 } from "three";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { SurfaceMaterialId } from "../physics/SurfaceMaterial";
import { KinematicBox } from "./KinematicBox";

export interface MovingPlatformOptions {
  id: string;
  origin: Vector3;
  size: Vector3;
  axis: Vector3;
  travel: number;
  speed: number;
  surface?: SurfaceMaterialId;
  visual: Group;
}

export class MovingPlatform extends KinematicBox {
  private readonly origin: Vector3;
  private readonly axis: Vector3;
  private readonly travel: number;
  private readonly speed: number;
  private readonly visual: Group;

  constructor(physics: PhysicsWorld, options: MovingPlatformOptions) {
    super(physics, {
      id: options.id,
      position: options.origin,
      size: options.size,
      surface: options.surface ?? "rusted-metal"
    });
    this.origin = options.origin.clone();
    this.axis = options.axis.clone().normalize();
    this.travel = options.travel;
    this.speed = options.speed;
    this.visual = options.visual;
  }

  update(time: number): void {
    const offset = Math.sin(time * this.speed) * this.travel;
    this.setTransform(this.origin.clone().addScaledVector(this.axis, offset), this.rotation);
    this.visual.position.copy(this.position);
    this.visual.quaternion.copy(this.quaternion);
  }
}
