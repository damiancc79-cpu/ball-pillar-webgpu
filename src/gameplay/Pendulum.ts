import { Group, Vector3 } from "three";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import { KinematicBox } from "./KinematicBox";

export interface PendulumOptions {
  id: string;
  pivot: Vector3;
  length: number;
  speed: number;
  visual: Group;
}

export class Pendulum extends KinematicBox {
  private readonly pivot: Vector3;
  private readonly length: number;
  private readonly speed: number;
  private readonly visual: Group;

  constructor(physics: PhysicsWorld, options: PendulumOptions) {
    super(physics, {
      id: options.id,
      position: options.pivot.clone().add(new Vector3(0, -options.length, 0)),
      size: new Vector3(1.1, 1.1, 1.1),
      surface: "polished-metal"
    });
    this.pivot = options.pivot.clone();
    this.length = options.length;
    this.speed = options.speed;
    this.visual = options.visual;
  }

  update(time: number): void {
    const swing = Math.sin(time * this.speed) * 0.72;
    const x = Math.sin(swing) * this.length;
    const y = -Math.cos(swing) * this.length;
    this.position.set(this.pivot.x + x, this.pivot.y + y, this.pivot.z);
    this.rotation.set(0, 0, -swing);
    this.setTransform(this.position, this.rotation);
    this.visual.position.copy(this.position);
    this.visual.quaternion.copy(this.quaternion);
  }
}
