import type { Camera, Scene } from "three";
import type { MainMenuScene } from "./MainMenuScene";
import type { GameScene } from "./GameScene";

export type SceneMode = "menu" | "game";

export class SceneManager {
  private mode: SceneMode = "menu";
  private game: GameScene;

  constructor(
    private readonly menu: MainMenuScene,
    game: GameScene
  ) {
    this.game = game;
  }

  /** Replaces the playable scene after a level selection without recreating the title scene. */
  setGame(game: GameScene): void {
    this.game = game;
  }

  showMenu(): void {
    this.mode = "menu";
  }

  showGame(): void {
    this.mode = "game";
  }

  resize(width: number, height: number): void {
    this.menu.resize(width, height);
    this.game.camera.aspect = width / height;
    this.game.camera.updateProjectionMatrix();
  }

  update(elapsed: number, delta: number): void {
    if (this.mode === "menu") this.menu.update(elapsed);
    else this.game.updateVisuals(delta, elapsed);
  }

  get active(): { scene: Scene; camera: Camera } {
    return this.mode === "menu"
      ? { scene: this.menu.scene, camera: this.menu.camera }
      : { scene: this.game.scene, camera: this.game.camera };
  }
}
