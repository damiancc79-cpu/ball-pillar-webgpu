import { Vector3 } from "three";

export interface LaunchPadOptions {
  position: Vector3;
  radius: number;
  impulse: Vector3;
  cooldownSeconds?: number;
}

export class LaunchPad {
  private cooldown = 0;
  private readonly position: Vector3;
  private readonly radiusSquared: number;

  constructor(private readonly options: LaunchPadOptions) {
    this.position = options.position.clone();
    this.radiusSquared = options.radius * options.radius;
  }

  update(delta: number, ballPosition: Vector3, launch: (impulse: Vector3) => void): boolean {
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (this.cooldown > 0 || ballPosition.distanceToSquared(this.position) > this.radiusSquared) return false;
    launch(this.options.impulse);
    this.cooldown = this.options.cooldownSeconds ?? 1.1;
    return true;
  }
}
