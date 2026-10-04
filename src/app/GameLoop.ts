import { FIXED_TIMESTEP, MAX_FRAME_DELTA, MAX_PHYSICS_STEPS } from "../config/GameConfig";
import { Time } from "./Time";

export interface GameLoopCallbacks {
  beforePhysics(delta: number): void;
  physicsStep(fixedDelta: number): void;
  afterPhysics(delta: number, interpolation: number): void;
  render(): void;
  isPaused(): boolean;
}

export class GameLoop {
  private readonly time = new Time();
  private accumulator = 0;
  private raf = 0;
  private running = false;
  physicsSteps = 0;

  constructor(private readonly callbacks: GameLoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.time.reset();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resetAccumulator(): void {
    this.accumulator = 0;
    this.time.reset();
  }

  private readonly frame = (): void => {
    if (!this.running) return;
    const delta = this.time.next(MAX_FRAME_DELTA);
    this.physicsSteps = 0;

    // Input and UI must continue to run while menus or pause screens are open.
    this.callbacks.beforePhysics(delta);
    if (!this.callbacks.isPaused()) {
      this.accumulator += delta;
      while (this.accumulator >= FIXED_TIMESTEP && this.physicsSteps < MAX_PHYSICS_STEPS) {
        this.callbacks.physicsStep(FIXED_TIMESTEP);
        this.accumulator -= FIXED_TIMESTEP;
        this.physicsSteps += 1;
      }
      if (this.physicsSteps === MAX_PHYSICS_STEPS) this.accumulator = 0;
    }
    this.callbacks.afterPhysics(delta, this.accumulator / FIXED_TIMESTEP);

    this.callbacks.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
