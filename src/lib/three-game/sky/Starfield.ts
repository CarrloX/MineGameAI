
import * as THREE from 'three';

export class Starfield {
  public mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private texture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, textureLoader: THREE.TextureLoader, radius: number = 900) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      transparent: true,
      opacity: 0, // Start invisible
      depthWrite: false,
      fog: false, // Stars should not be affected by scene fog
    });

    textureLoader.load('https://placehold.co/2048x1024/000000/FFFFFF.png?text=Stars', (loadedTexture) => {
      this.texture = loadedTexture;
      this.texture.wrapS = THREE.RepeatWrapping;
      this.texture.wrapT = THREE.RepeatWrapping;
      (this.texture as any)['data-ai-hint'] = 'starry night space';
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    });

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
    this.material.map?.dispose(); // Dispose texture if it was loaded
    this.material.dispose();
  }
}
