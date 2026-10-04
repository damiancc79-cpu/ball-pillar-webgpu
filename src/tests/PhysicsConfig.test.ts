import { describe, expect, it } from "vitest";

import {
  DEFAULT_BALL_PHYSICS_CONFIG,
  DEFAULT_PHYSICS_WORLD_CONFIG,
  FIXED_TIMESTEP,
  createBallPhysicsConfig,
  createPhysicsWorldConfig
} from "../config/PhysicsConfig";

describe("physics configuration", () => {
  it("uses a stable 60 Hz fixed timestep", () => {
    expect(FIXED_TIMESTEP).toBeCloseTo(1 / 60, 12);
    expect(DEFAULT_PHYSICS_WORLD_CONFIG.fixedTimestep).toBe(FIXED_TIMESTEP);
  });

  it("creates independent ball tuning objects from partial overrides", () => {
    const tuned = createBallPhysicsConfig({
      maxLinearSpeed: 21,
      radius: 0.72
    });

    expect(tuned).toMatchObject({
      maxLinearSpeed: 21,
      radius: 0.72,
      accelerationTorque: DEFAULT_BALL_PHYSICS_CONFIG.accelerationTorque
    });
    expect(tuned).not.toBe(DEFAULT_BALL_PHYSICS_CONFIG);
  });

  it("does not share gravity references between world configurations", () => {
    const configured = createPhysicsWorldConfig({ gravity: { x: 3, y: -9, z: 1 } });
    configured.gravity.x = 100;

    expect(DEFAULT_PHYSICS_WORLD_CONFIG.gravity.x).toBe(0);
    expect(configured.gravity).toEqual({ x: 100, y: -9, z: 1 });
  });
});
