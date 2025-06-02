
import * as THREE from 'three';

export class Starfield {
  public mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private texture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene, textureLoader: THREE.TextureLoader, radius: number = 800) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16); // Higher segments for smoother sphere
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      transparent: true,
      opacity: 0, // Start invisible
      depthWrite: false, // Render behind everything without affecting depth buffer
    });

    textureLoader.load('https://placehold.co/2048x1024/000000/FFFFFF.png?text=Stars', (tex) => {
      this.texture = tex;
      this.texture.wrapS = THREE.RepeatWrapping; // For rotation if an equirectangular map is used
      this.texture.wrapT = THREE.RepeatWrapping;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    });
    (this.texture as any) = {'data-ai-hint': 'starry night space'};


    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "StarfieldSphere";
    this.mesh.renderOrder = -2; // Ensure it's drawn very early (behind skybox)
    scene.add(this.mesh);
  }

  public update(cameraPosition: THREE.Vector3, intensity: number): void {
    this.mesh.position.copy(cameraPosition); // Keep starfield centered on camera
    this.material.opacity = intensity;

    // Optional: slow rotation
    // this.mesh.rotation.y += 0.0001;
  }

  public setIntensity(intensity: number): void {
    this.material.opacity = Math.max(0, Math.min(1, intensity));
  }
  
  public setColor(color: THREE.Color): void {
    this.material.color.copy(color); // Allow tinting stars, e.g. by milky way color
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    // Removal from scene handled by main Sky system or AdvancedSky
  }
}
