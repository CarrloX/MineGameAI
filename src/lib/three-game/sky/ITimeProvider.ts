export interface ITimeProvider {
  /**
   * Gets the current time of day, normalized between 0.0 (midnight) and 1.0 (next midnight).
   */
  getCurrentTimeNormalized(): number;

  /**
   * Updates the internal time.
   * @param deltaTime The time elapsed since the last frame, in seconds.
   */
  update(deltaTime: number): void;
}
