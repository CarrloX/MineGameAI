
import * as THREE from 'three';
import type { ISkyColorProvider } from './ISkyColorProvider';
// CelestialBodyController and Starfield will be integrated in a later step

export class SkyRenderer {
  private scene: THREE.Scene;
  private skyColorProvider: ISkyColorProvider;
  
  private skyboxMesh: THREE.Mesh;
  private skyboxMaterial: THREE.MeshBasicMaterial;

  constructor(
    scene: THREE.Scene,
    skyColorProvider: ISkyColorProvider,
    skyboxRadius: number = 1000 // Default radius
  ) {
    this.scene = scene;
    this.skyColorProvider = skyColorProvider;

    // Skybox
    const skyboxGeometry = new THREE.SphereGeometry(skyboxRadius, 32, 16);
    this.skyboxMaterial = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false, // Skybox itself should not be affected by scene fog
    });
    this.skyboxMesh = new THREE.Mesh(skyboxGeometry, this.skyboxMaterial);
    this.skyboxMesh.name = "SkyboxSphere";
    this.skyboxMesh.renderOrder = -1; // Render after starfield (if any) but before most other things
    this.scene.add(this.skyboxMesh);
  }

  public update(camera: THREE.Camera): void {
    // Update Skybox color
    this.skyboxMaterial.color.copy(this.skyColorProvider.getSkyColor());
    
    // Keep skybox centered on camera
    this.skyboxMesh.position.copy(camera.position);

    // Logic for Starfield and Celestial Bodies will be added in subsequent steps
  }

  public dispose(): void {
    if (this.skyboxMesh.parent) {
      this.skyboxMesh.parent.remove(this.skyboxMesh);
    }
    this.skyboxMesh.geometry.dispose();
    this.skyboxMaterial.dispose();
  }
}
