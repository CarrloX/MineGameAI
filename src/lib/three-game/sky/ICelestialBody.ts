
import type * as THREE from 'three';

export interface ICelestialBodyData {
  position: THREE.Vector3; // Position relative to the camera or sky dome center
  texture: THREE.Texture | null;
  size: number; // Apparent size in the sky
  color: THREE.Color; // Tint color for the body
  intensity: number; // For emissive properties or overall brightness
  isVisible: boolean;
}

export interface ICelestialBody {
  /**
   * Updates the celestial body's state (e.g., position, visibility).
   * @param timeNormalized Current time of day, normalized (0.0 to 1.0).
   * @param cameraPosition Current position of the camera (for effects like lens flare or positioning).
   */
  update(timeNormalized: number, cameraPosition: THREE.Vector3): void;

  /**
   * Gets the data required to render this celestial body.
   */
  getRenderData(): ICelestialBodyData;

  /**
   * Disposes of any THREE.js resources used by this body.
   */
  dispose(): void;
}
