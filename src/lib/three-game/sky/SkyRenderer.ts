
import * as THREE from 'three';
import type { ISkyColorProvider } from './ISkyColorProvider';
import type { CelestialBodyController } from './CelestialBodyController'; // Now needed
import type { Starfield } from './Starfield'; // Will be needed soon
import type { ICelestialBodyData } from './ICelestialBody';


export class SkyRenderer {
  private scene: THREE.Scene;
  private skyColorProvider: ISkyColorProvider;
  private celestialBodyController: CelestialBodyController; // Added
  // private starfield: Starfield; // Will uncomment later

  private skyboxMesh: THREE.Mesh;
  private skyboxMaterial: THREE.MeshBasicMaterial;

  private celestialBodyMeshes: Map<string, THREE.Mesh>; // To store meshes for sun, moon, etc.

  constructor(
    scene: THREE.Scene,
    textureLoader: THREE.TextureLoader, // Added textureLoader
    skyColorProvider: ISkyColorProvider,
    celestialBodyController: CelestialBodyController // Added
    // starfield: Starfield // Will uncomment later
  ) {
    this.scene = scene;
    this.skyColorProvider = skyColorProvider;
    this.celestialBodyController = celestialBodyController; // Stored
    // this.starfield = starfield; // Will uncomment later

    const skyboxGeometry = new THREE.SphereGeometry(1000, 32, 16); // Default radius
    this.skyboxMaterial = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyboxMesh = new THREE.Mesh(skyboxGeometry, this.skyboxMaterial);
    this.skyboxMesh.name = "SkyboxSphere";
    this.skyboxMesh.renderOrder = -1;
    this.scene.add(this.skyboxMesh);

    this.celestialBodyMeshes = new Map();
  }

  private getOrCreateCelestialBodyMesh(bodyData: ICelestialBodyData): THREE.Mesh {
    let mesh = this.celestialBodyMeshes.get(bodyData.name);
    if (!mesh) {
      const geometry = new THREE.PlaneGeometry(1, 1); // Base size, will be scaled
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        // Consider THREE.AdditiveBlending for the sun later if desired
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = `CelestialBody_${bodyData.name}`;
      // Render order: stars (-2), skybox (-1), sun/moon (e.g., -0.9, -0.8)
      mesh.renderOrder = bodyData.name === 'sun' ? -0.9 : -0.8; 
      this.scene.add(mesh);
      this.celestialBodyMeshes.set(bodyData.name, mesh);
    }
    return mesh;
  }

  public update(camera: THREE.Camera): void {
    // Update Skybox color
    this.skyboxMaterial.color.copy(this.skyColorProvider.getSkyColor());
    this.skyboxMesh.position.copy(camera.position);

    // Starfield update will go here later

    // Update Celestial Bodies
    const bodiesData = this.celestialBodyController.getRenderableBodiesData();
    
    // Hide meshes that are no longer in bodiesData (e.g. if a body is removed dynamically)
    // Or simply rely on bodyData.isVisible for existing meshes.
    // For now, we only have sun and moon, so we update or hide them.
    
    const activeBodyNames = new Set(bodiesData.map(bd => bd.name));

    this.celestialBodyMeshes.forEach((mesh, name) => {
        if (!activeBodyNames.has(name)) {
            mesh.visible = false;
        }
    });


    for (const bodyData of bodiesData) {
      const mesh = this.getOrCreateCelestialBodyMesh(bodyData);
      const material = mesh.material as THREE.MeshBasicMaterial;

      if (bodyData.isVisible && bodyData.texture && bodyData.intensity > 0.01) {
        mesh.visible = true;
        mesh.position.copy(bodyData.position);
        mesh.scale.set(bodyData.size, bodyData.size, 1);
        mesh.lookAt(camera.position); // Make the plane face the camera

        material.map = bodyData.texture;
        material.color.copy(bodyData.color);
        material.opacity = bodyData.intensity;
        material.needsUpdate = true; // Important if texture changes
      } else {
        mesh.visible = false;
      }
    }
  }

  public dispose(): void {
    if (this.skyboxMesh.parent) {
      this.skyboxMesh.parent.remove(this.skyboxMesh);
    }
    this.skyboxMesh.geometry.dispose();
    this.skyboxMaterial.dispose();

    this.celestialBodyMeshes.forEach((mesh) => {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.celestialBodyMeshes.clear();

    // Starfield dispose will go here later
  }
}
