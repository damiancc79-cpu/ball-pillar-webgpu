import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  Vector3
} from "three";

interface ParticleSlot {
  life: number;
  maxLife: number;
  velocity: Vector3;
}

/** Small pooled point system for dust, sparks, checkpoint arcs, and goal bursts. */
export class FeedbackParticles {
  readonly points: Points<BufferGeometry, PointsMaterial>;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly slots: ParticleSlot[];
  private readonly positionAttribute: BufferAttribute;
  private readonly colorAttribute: BufferAttribute;
  private cursor = 0;

  constructor(private readonly capacity = 96) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.slots = Array.from({ length: capacity }, () => ({ life: 0, maxLife: 0, velocity: new Vector3() }));
    const geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3);
    this.colorAttribute = new BufferAttribute(this.colors, 3);
    geometry.setAttribute("position", this.positionAttribute);
    geometry.setAttribute("color", this.colorAttribute);
    this.points = new Points(
      geometry,
      new PointsMaterial({
        size: 0.14,
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: AdditiveBlending
      })
    );
    this.points.frustumCulled = false;
  }

  emit(origin: Vector3, color: Color | string | number, count = 10, speed = 2.2): void {
    const tint = new Color(color);
    for (let index = 0; index < count; index += 1) {
      const slotIndex = this.cursor++ % this.capacity;
      const slot = this.slots[slotIndex];
      slot.life = 0.28 + Math.random() * 0.42;
      slot.maxLife = slot.life;
      const direction = slot.velocity
        .set(Math.random() - 0.5, Math.random() * 0.85 + 0.12, Math.random() - 0.5)
        .normalize();
      direction.multiplyScalar(speed * (0.45 + Math.random() * 0.7));
      const offset = slotIndex * 3;
      this.positions[offset] = origin.x;
      this.positions[offset + 1] = origin.y;
      this.positions[offset + 2] = origin.z;
      this.colors[offset] = tint.r;
      this.colors[offset + 1] = tint.g;
      this.colors[offset + 2] = tint.b;
    }
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  update(delta: number): void {
    let changed = false;
    for (let index = 0; index < this.capacity; index += 1) {
      const slot = this.slots[index];
      if (slot.life <= 0) continue;
      slot.life = Math.max(0, slot.life - delta);
      const offset = index * 3;
      this.positions[offset] += slot.velocity.x * delta;
      this.positions[offset + 1] += slot.velocity.y * delta;
      this.positions[offset + 2] += slot.velocity.z * delta;
      slot.velocity.y -= 4.4 * delta;
      const fade = slot.maxLife > 0 ? slot.life / slot.maxLife : 0;
      this.colors[offset] *= 0.996 * fade + 0.004;
      this.colors[offset + 1] *= 0.996 * fade + 0.004;
      this.colors[offset + 2] *= 0.996 * fade + 0.004;
      changed = true;
    }
    if (changed) {
      this.positionAttribute.needsUpdate = true;
      this.colorAttribute.needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.removeFromParent();
  }
}
