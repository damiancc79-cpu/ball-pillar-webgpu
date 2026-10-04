import { InputManager } from "../input/InputManager";
import { UIManager } from "../ui/UIManager";

/**
 * Development-only DOM harness for Playwright. It exercises the same menus,
 * keyboard mapping, settings controls, pause, reset, and restart paths when a
 * CI browser has no GPU device. It is never selected by a production build.
 */
export function startSmokeHarness(host: HTMLElement): void {
  const status = document.createElement("output");
  status.id = "smoke-status";
  status.hidden = true;
  status.dataset.resetCount = "0";
  status.dataset.restartCount = "0";
  status.dataset.jumpCount = "0";
  status.dataset.selectedLevel = "";
  host.append(status);

  const input = new InputManager();
  const ui = new UIManager({ container: host });
  ui.configureCallbacks({
    onStart: () => {
      status.dataset.state = "game";
      ui.setHUDState({ speed: 8, checkpoint: "SMOKE PLATFORM", elapsedSeconds: 1.2, prompt: "TEST SIGNAL" });
    },
    onResume: () => {
      status.dataset.state = "game";
    },
    onRestart: () => {
      status.dataset.restartCount = String(Number(status.dataset.restartCount ?? "0") + 1);
      status.dataset.state = "game";
    },
    onJump: () => {
      status.dataset.jumpCount = String(Number(status.dataset.jumpCount ?? "0") + 1);
    },
    onLevelSelect: (levelId) => {
      status.dataset.selectedLevel = levelId;
      status.dataset.state = "game";
      ui.setHUDState({ speed: 0, checkpoint: "ROLL BAY", elapsedSeconds: 0, prompt: "TRAINING READY" });
      ui.setScreen("game");
    },
    onReset: () => {
      status.dataset.resetCount = String(Number(status.dataset.resetCount ?? "0") + 1);
    },
    onPauseChange: (paused) => {
      status.dataset.state = paused ? "pause" : "game";
    }
  });
  input.connect();
  ui.setScreen("menu");

  const update = (): void => {
    input.update();
    ui.update(input);
    requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
