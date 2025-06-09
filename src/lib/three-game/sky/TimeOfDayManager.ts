import type { ITimeProvider } from "./ITimeProvider";

export class TimeOfDayManager implements ITimeProvider {
  private currentTime: number; // Current time in seconds from the start of the cycle
  public cycleDurationMinutes: number; // Duration of a full 24-hour cycle in real-time minutes
  private cycleDurationSeconds: number;

  constructor(
    cycleDurationMinutes: number = 20,
    initialTimeNormalized: number = 0.25
  ) {
    // Default to 20 min, start at 6 AM
    this.cycleDurationMinutes = cycleDurationMinutes;
    this.cycleDurationSeconds = this.cycleDurationMinutes * 60;
    this.currentTime = initialTimeNormalized * this.cycleDurationSeconds;
  }

  public update(deltaTime: number): void {
    this.currentTime += deltaTime;
    if (this.currentTime >= this.cycleDurationSeconds) {
      this.currentTime -= this.cycleDurationSeconds;
    }
  }

  public getCurrentTimeNormalized(): number {
    return this.currentTime / this.cycleDurationSeconds;
  }

  public setTimeNormalized(normalizedTime: number): void {
    this.currentTime =
      Math.max(0, Math.min(1, normalizedTime)) * this.cycleDurationSeconds;
  }
}
