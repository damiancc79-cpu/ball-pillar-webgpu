import { Group, Vector3 } from "three";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { KinematicBox } from "./KinematicBox";

export interface SeesawOptions {
  id: string;
  position: Vector3;
  size: Vector3;
  visual: Group;
}

/** A stable kinematic seesaw: it gives the counterweight puzzle a readable mechanical state without unstable joint drift. */
export class Seesaw extends KinematicBox {
  private targetTilt = 0;
  private currentTilt = 0;
  private readonly visual: Group;

  constructor(physics: PhysicsWorld, options: SeesawOptions) {
    super(physics, {
      id: options.id,
      position: options.position,
      size: options.size,
      surface: "rusted-metal"
    });
    this.visual = options.visual;
  }

  setCounterweightEngaged(engaged: boolean): void {
    this.targetTilt = engaged ? -0.18 : 0.18;
  }

  update(delta: number): void {
    this.currentTilt += (this.targetTilt - this.currentTilt) * Math.min(1, delta * 2.5);
    this.rotation.set(0, 0, this.currentTilt);
    this.setTransform(this.position, this.rotation);
    this.visual.position.copy(this.position);
    this.visual.quaternion.copy(this.quaternion);
  }
}
