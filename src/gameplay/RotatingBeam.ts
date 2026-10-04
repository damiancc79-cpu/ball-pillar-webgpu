import { Group, Vector3 } from "three";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { SurfaceMaterialId } from "../physics/SurfaceMaterial";
import { KinematicBox } from "./KinematicBox";

export interface RotatingBeamOptions {
  id: string;
  position: Vector3;
  size: Vector3;
  speed: number;
  phase?: number;
  surface?: SurfaceMaterialId;
  visual: Group;
}

export class RotatingBeam extends KinematicBox {
  private readonly speed: number;
  private readonly phase: number;
  private readonly visual: Group;

  constructor(physics: PhysicsWorld, options: RotatingBeamOptions) {
    super(physics, {
      id: options.id,
      position: options.position,
      size: options.size,
      surface: options.surface ?? "rusted-metal"
    });
    this.speed = options.speed;
    this.phase = options.phase ?? 0;
    this.visual = options.visual;
  }

  update(time: number): void {
    this.rotation.set(0, time * this.speed + this.phase, 0);
    this.setTransform(this.position, this.rotation);
    this.visual.position.copy(this.position);
    this.visual.quaternion.copy(this.quaternion);
  }
}
