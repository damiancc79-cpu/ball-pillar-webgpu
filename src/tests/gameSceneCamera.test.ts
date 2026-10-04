import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  PILLAR_WORKS_LEVEL,
  ROLL_TRAINING_LEVEL,
  TURBINE_SPINE_LEVEL,
  type TutorialStepDefinition
} from "../level/LevelDefinition";
import { GameScene } from "../scene/GameScene";

describe("gameplay camera framing", () => {
  it("starts above and behind the ball with a valid playable view", async () => {
    const game = await GameScene.create();

    game.updateVisuals(1 / 60, 0);
    const ball = game.physics.getBodyTranslation(game.ball.body);
    const offset = game.camera.position.clone().sub(new Vector3(ball.x, ball.y + 0.42, ball.z));

    expect(Number.isFinite(game.camera.position.x)).toBe(true);
    expect(Number.isFinite(game.camera.position.y)).toBe(true);
    expect(Number.isFinite(game.camera.position.z)).toBe(true);
    expect(offset.y).toBeGreaterThan(8);
    expect(Math.hypot(offset.x, offset.z)).toBeGreaterThan(4);
    const targetDirection = new Vector3(ball.x, ball.y + 0.42, ball.z).sub(game.camera.position).normalize();
    expect(game.camera.getWorldDirection(new Vector3()).dot(targetDirection)).toBeGreaterThan(0.99);

    game.dispose();
  });

  it("starts the training course with a movement-led tutorial", async () => {
    const prompts: Array<TutorialStepDefinition | undefined> = [];
    const game = await GameScene.create({
      level: ROLL_TRAINING_LEVEL,
      callbacks: { onTutorial: (step) => prompts.push(step) }
    });

    game.start();
    expect(game.definition.id).toBe("roll-training");
    expect(prompts.at(-1)?.id).toBe("roll");

    game.setInput({
      move: { x: 0, y: 1 },
      lookX: 0,
      lookY: 0,
      brake: false,
      boost: false,
      jump: false,
      precision: false,
      recenter: false
    });
    game.stepPhysics(1 / 60);

    expect(prompts.at(-1)?.id).toBe("jump");
    game.dispose();
  });

  it("advances the complete training sequence and keeps final machinery out of the course", async () => {
    const prompts: Array<TutorialStepDefinition | undefined> = [];
    const training = await GameScene.create({
      level: ROLL_TRAINING_LEVEL,
      callbacks: { onTutorial: (step) => prompts.push(step) }
    });
    const finalCourse = await GameScene.create({ level: PILLAR_WORKS_LEVEL });

    training.start();
    training.setInput({
      move: { x: 1, y: 0 },
      lookX: 0,
      lookY: 0,
      brake: false,
      boost: false,
      jump: false,
      precision: false,
      recenter: false
    });
    training.stepPhysics(1 / 60);
    expect(prompts.at(-1)?.id).toBe("jump");

    training.setInput({
      move: { x: 0, y: 0 },
      lookX: 0,
      lookY: 0,
      brake: false,
      boost: false,
      jump: false,
      precision: false,
      recenter: false
    });
    for (let step = 0; step < 4 && prompts.at(-1)?.id !== "brake"; step += 1) {
      training.requestJump();
      training.stepPhysics(1 / 60);
    }
    expect(prompts.at(-1)?.id).toBe("brake");

    training.setInput({
      move: { x: 0, y: 0 },
      lookX: 0,
      lookY: 0,
      brake: true,
      boost: false,
      jump: false,
      precision: true,
      recenter: false
    });
    training.stepPhysics(1 / 60);
    expect(prompts.at(-1)?.id).toBe("exit");

    training.ball.respawn(new Vector3(...ROLL_TRAINING_LEVEL.goal.position));
    training.stepPhysics(1 / 60);
    expect(prompts.at(-1)).toBeUndefined();
    expect(training.metrics.physicsBodies).toBeLessThan(finalCourse.metrics.physicsBodies);
    expect(training.scene.getObjectByName("counterweight-bridge")).toBeUndefined();

    training.dispose();
    finalCourse.dispose();
  });

  it("builds the advanced turbine course with its own timed hazards before the finale", async () => {
    const game = await GameScene.create({ level: TURBINE_SPINE_LEVEL });

    expect(game.definition.id).toBe("turbine-spine");
    expect(game.scene.getObjectByName("spine-transfer-lift")).toBeDefined();
    expect(game.scene.getObjectByName("spine-rotor-arm")).toBeDefined();
    expect(game.scene.getObjectByName("spine-service-carriage")).toBeDefined();
    expect(game.scene.getObjectByName("counterweight-bridge")).toBeUndefined();
    expect(game.metrics.physicsBodies).toBeGreaterThan(TURBINE_SPINE_LEVEL.entities.length);

    game.start();
    game.stepPhysics(1 / 60);
    game.dispose();
  });
});
