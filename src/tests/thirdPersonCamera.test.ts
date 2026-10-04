import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { ThirdPersonCamera } from "../camera/ThirdPersonCamera";

describe("third-person camera", () => {
  it("settles into a high aerial follow view above the ball", () => {
    const camera = new PerspectiveCamera();
    const follow = new ThirdPersonCamera(camera);

    for (let frame = 0; frame < 36; frame += 1) {
      follow.update(1 / 60, { x: 0, y: 0, z: 0 });
    }

    expect(camera.position.y).toBeGreaterThan(12);
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeGreaterThan(5);
    expect(follow.config.minPitch).toBeGreaterThan(0.75);
  });

  it("can pull in below the aerial distance when an overhead obstacle blocks the ray", () => {
    const camera = new PerspectiveCamera();
    const follow = new ThirdPersonCamera(camera);
    follow.setCollisionQuery({ castRay: () => ({ distance: 3 }) });

    for (let frame = 0; frame < 48; frame += 1) {
      follow.update(1 / 60, { x: 0, y: 0, z: 0 });
    }

    expect(camera.position.length()).toBeLessThan(4);
    expect(follow.config.minDistance).toBeLessThan(3);
  });
});
