export class Time {
  private last = performance.now();
  elapsed = 0;

  next(maxDelta: number): number {
    const now = performance.now();
    const delta = Math.min((now - this.last) / 1000, maxDelta);
    this.last = now;
    this.elapsed += delta;
    return delta;
  }

  reset(): void {
    this.last = performance.now();
  }
}
