import { describe, expect, it } from "vitest";

import { BallController } from "../player/BallController";
import { PhysicsWorld } from "../physics/PhysicsWorld";

async function createGroundedController(): Promise<{
  physics: PhysicsWorld;
  ball: ReturnType<PhysicsWorld["createDynamicBall"]>;
  controller: BallController;
}> {
  const physics = await PhysicsWorld.create();
  physics.createStaticBox({
    position: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 12, y: 0.5, z: 12 },
    surface: "concrete"
  });
  const ball = physics.createDynamicBall({
    position: { x: 0, y: 1.08, z: 0 },
    surface: "polished-metal"
  });
  for (let frame = 0; frame < 5; frame += 1) {
    physics.stepFixed();
  }
  return { physics, ball, controller: new BallController(physics, ball) };
}

describe("ball controls", () => {
  it("rolls toward the camera-relative forward input instead of away from it", async () => {
    const { physics, ball, controller } = await createGroundedController();

    try {
      controller.update(1 / 60, { x: 0, y: 1 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });

      expect(ball.body.angvel().x).toBeGreaterThan(0);
    } finally {
      physics.dispose();
    }
  });

  it("accepts one grounded jump and prevents impulse stacking", async () => {
    const { physics, ball, controller } = await createGroundedController();

    try {
      const firstJump = controller.update(
        1 / 60,
        { x: 0, y: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 0 },
        { jump: true }
      );
      const jumpVelocity = ball.body.linvel().y;

      expect(firstJump.jumped).toBe(true);
      expect(jumpVelocity).toBeGreaterThan(6);

      const repeatedJump = controller.update(
        1 / 60,
        { x: 0, y: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 0 },
        { jump: true }
      );

      expect(repeatedJump.jumped).toBe(false);
      expect(ball.body.linvel().y).toBeCloseTo(jumpVelocity, 6);
    } finally {
      physics.dispose();
    }
  });
});
