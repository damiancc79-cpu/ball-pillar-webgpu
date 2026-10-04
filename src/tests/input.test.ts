import { describe, expect, it } from "vitest";

import { GamepadInput, type GamepadLike } from "../input/GamepadInput";
import { applyRadialDeadZone } from "../input/InputActions";
import { InputManager } from "../input/InputManager";
import { KeyboardInput } from "../input/KeyboardInput";

function keyEvent(code: string, repeat = false): Pick<KeyboardEvent, "code" | "repeat" | "preventDefault"> {
  return { code, repeat, preventDefault: () => undefined };
}

function makePad(overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    connected: true,
    id: "Test Pad",
    index: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    ...overrides
  };
}

describe("input action abstraction", () => {
  it("maps keyboard edge states and movement axes to semantic actions", () => {
    const keyboard = new KeyboardInput();
    const gamepad = new GamepadInput({ navigator: { getGamepads: () => [] } });
    const input = new InputManager({ keyboard, gamepad });

    keyboard.handleKeyDown(keyEvent("KeyW"));
    keyboard.handleKeyDown(keyEvent("ShiftLeft"));
    keyboard.handleKeyDown(keyEvent("Space"));
    input.update();

    expect(input.isDown("moveForward")).toBe(true);
    expect(input.getAxis("moveY")).toBe(1);
    expect(input.isDown("boost")).toBe(true);
    expect(input.isDown("jump")).toBe(true);
    expect(input.consumePressed("moveForward")).toBe(true);
    expect(input.consumePressed("moveForward")).toBe(false);

    keyboard.handleKeyUp(keyEvent("KeyW"));
    input.update();
    expect(input.isDown("moveForward")).toBe(false);
    expect(input.wasReleased("moveForward")).toBe(true);
  });

  it("uses radial gamepad dead zones and standard button actions", () => {
    let pad = makePad({
      axes: [0.65, -0.8, 0.4, -0.3],
      buttons: Array.from({ length: 16 }, (_, index) => ({
        pressed: index === 0,
        value: index === 0 ? 1 : 0
      }))
    });
    const gamepad = new GamepadInput({ navigator: { getGamepads: () => [pad] }, deadZone: 0.16 });
    const input = new InputManager({ keyboard: new KeyboardInput(), gamepad });

    input.update();
    expect(input.activeDevice).toBe("gamepad");
    expect(input.getAxis("moveX")).toBeGreaterThan(0.5);
    expect(input.getAxis("moveY")).toBeGreaterThan(0.7);
    expect(input.isDown("jump")).toBe(true);
    expect(input.consumePressed("confirm")).toBe(true);

    pad = makePad();
    input.update();
    expect(input.wasReleased("confirm")).toBe(true);
  });

  it("removes small stick drift without changing direction outside the dead zone", () => {
    expect(applyRadialDeadZone(0.08, -0.04, 0.16)).toEqual({ x: 0, y: 0 });
    const vector = applyRadialDeadZone(0.6, -0.6, 0.16);
    expect(vector.x).toBeGreaterThan(0);
    expect(vector.y).toBeLessThan(0);
    expect(Math.hypot(vector.x, vector.y)).toBeLessThanOrEqual(1);
  });

  it("uses conventional up-stick directions for movement and camera look", () => {
    const pad = makePad({ axes: [0, -1, 0, -1] });
    const gamepad = new GamepadInput({ navigator: { getGamepads: () => [pad] } });
    const input = new InputManager({ keyboard: new KeyboardInput(), gamepad });

    input.update();
    expect(input.getAxis("moveY")).toBeGreaterThan(0);
    expect(input.getAxis("cameraY")).toBeGreaterThan(0);

    input.setCameraSettings({ invertGamepadY: true });
    input.update();
    expect(input.getAxis("cameraY")).toBeLessThan(0);
  });
});
