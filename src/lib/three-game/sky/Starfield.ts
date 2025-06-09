import * as THREE from "three";

export class Starfield {
  public mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private texture: THREE.Texture | null = null; // Set to null

  constructor(
    scene: THREE.Scene,
    textureLoader: THREE.TextureLoader,
    radius: number = 900
  ) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    this.material = new THREE.MeshBasicMaterial({
      // No map initially, rely on color or future direct texture assignment
      color: 0x050510, // A very dark color for the starfield background if no texture
      side: THREE.BackSide,
      transparent: true,
      opacity: 0, // Start invisible
      depthWrite: false,
      fog: false, // Stars should not be affected by scene fog
    });

    // No texture loading from placehold.co for the Starfield
    // (textureLoader is passed but not used here)

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "StarfieldSphere";
    this.mesh.renderOrder = -2; // Render before skybox
    scene.add(this.mesh);
  }

  public update(cameraPosition: THREE.Vector3, intensity: number): void {
    this.mesh.position.copy(cameraPosition);
    this.material.opacity = Math.max(0, Math.min(1, intensity)); // Clamp intensity to [0,1]

    // Optional: slow rotation for a very subtle effect over long periods
    // this.mesh.rotation.y += 0.00005;
  }

  // Optional: if direct control over color tinting is needed later
  public setColor(color: THREE.Color): void {
    this.material.color.copy(color);
  }

  public dispose(): void {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this.mesh.geometry.dispose();
    // No texture map to dispose from this.material itself
    this.material.dispose();
  }
}
