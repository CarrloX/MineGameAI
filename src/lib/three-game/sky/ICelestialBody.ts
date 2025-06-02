
import type * as THREE from 'three';

export interface ICelestialBodyData {
  name: string; // Added name
  position: THREE.Vector3;
  texture: THREE.Texture | null;
  size: number;
  color: THREE.Color;
  intensity: number;
  isVisible: boolean;
}

export interface ICelestialBody {
  name: string; // Ensure ICelestialBody itself has a name property if not already clear
  update(timeNormalized: number, cameraPosition: THREE.Vector3): void;
  getRenderData(): ICelestialBodyData;
  dispose(): void;
}
