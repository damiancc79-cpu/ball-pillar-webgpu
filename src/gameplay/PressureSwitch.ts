import { Vector3 } from "three";

export interface PressureSwitchOptions {
  id: string;
  position: Vector3;
  radius: number;
  requiredHoldSeconds?: number;
  onChanged?: (active: boolean) => void;
}

export class PressureSwitch {
  private active = false;
  private heldFor = 0;
  private readonly position: Vector3;
  private readonly radiusSquared: number;

  constructor(private readonly options: PressureSwitchOptions) {
    this.position = options.position.clone();
    this.radiusSquared = options.radius * options.radius;
  }

  update(delta: number, weightedObjects: readonly Vector3[]): boolean {
    const pressed = weightedObjects.some(
      (object) => object.distanceToSquared(this.position) <= this.radiusSquared
    );
    this.heldFor = pressed ? this.heldFor + delta : 0;
    const next = pressed && this.heldFor >= (this.options.requiredHoldSeconds ?? 0.1);
    if (next !== this.active) {
      this.active = next;
      this.options.onChanged?.(next);
    }
    return this.active;
  }
}
