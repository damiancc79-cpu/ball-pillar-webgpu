export type AppScreen =
  "loading" | "compatibility" | "menu" | "game" | "pause" | "options" | "controls" | "credits" | "complete";

export interface GameStateSnapshot {
  screen: AppScreen;
  paused: boolean;
  started: boolean;
  completed: boolean;
  checkpointName: string;
  elapsedSeconds: number;
}

export class GameState {
  private snapshot: GameStateSnapshot = {
    screen: "loading",
    paused: true,
    started: false,
    completed: false,
    checkpointName: "START PLATFORM",
    elapsedSeconds: 0
  };

  get value(): Readonly<GameStateSnapshot> {
    return this.snapshot;
  }

  setScreen(screen: AppScreen): void {
    this.snapshot.screen = screen;
  }

  start(): void {
    this.snapshot.started = true;
    this.snapshot.completed = false;
    this.snapshot.paused = false;
    this.snapshot.screen = "game";
    this.snapshot.elapsedSeconds = 0;
  }

  pause(): void {
    if (!this.snapshot.started || this.snapshot.completed) return;
    this.snapshot.paused = true;
    this.snapshot.screen = "pause";
  }

  resume(): void {
    if (!this.snapshot.started || this.snapshot.completed) return;
    this.snapshot.paused = false;
    this.snapshot.screen = "game";
  }

  setCheckpoint(name: string): void {
    this.snapshot.checkpointName = name;
  }

  finish(): void {
    this.snapshot.completed = true;
    this.snapshot.paused = true;
    this.snapshot.screen = "complete";
  }

  tick(deltaSeconds: number): void {
    if (this.snapshot.started && !this.snapshot.paused && !this.snapshot.completed) {
      this.snapshot.elapsedSeconds += deltaSeconds;
    }
  }
}
