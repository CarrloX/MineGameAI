
import type * as THREE from 'three';

export interface ISkyColorProvider {
  /**
   * Gets the current color for the skybox or sky background.
   */
  getSkyColor(): THREE.Color;

  /**
   * Gets the current color for the scene's fog.
   */
  getFogColor(): THREE.Color;

  /**
   * Gets the current color for the ambient light.
   */
  getAmbientLightColor(): THREE.Color;

  /**
   * Gets the current intensity for the ambient light.
   */
  getAmbientLightIntensity(): number;

  /**
   * Gets the current intensity for the starfield.
   * Value between 0 (invisible) and 1 (fully visible).
   */
  getStarfieldIntensity(): number;

  /**
   * Updates the internal colors based on the current time.
   * Typically called by a manager class.
   */
  updateColors(): void;
}
