
import * as THREE from 'three';
import type { ISkyColorProvider } from './ISkyColorProvider';
import type { CelestialBodyController } from './CelestialBodyController';
import type { Starfield } from './Starfield';
import type { ICelestialBodyData } from './ICelestialBody';


export class SkyRenderer {
  private scene: THREE.Scene;
  private skyColorProvider: ISkyColorProvider;
  private celestialBodyController: CelestialBodyController;
  private starfield: Starfield;

  private skyboxMesh: THREE.Mesh;
  private skyboxMaterial: THREE.MeshBasicMaterial;

  private celestialBodyMeshes: Map<string, THREE.Mesh>;

  constructor(
    scene: THREE.Scene,
    textureLoader: THREE.TextureLoader,
    skyColorProvider: ISkyColorProvider,
    celestialBodyController: CelestialBodyController,
    starfield: Starfield
  ) {
    this.scene = scene;
    this.skyColorProvider = skyColorProvider;
    this.celestialBodyController = celestialBodyController;
    this.starfield = starfield;

    const skyboxGeometry = new THREE.SphereGeometry(1000, 32, 16);
    this.skyboxMaterial = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyboxMesh = new THREE.Mesh(skyboxGeometry, this.skyboxMaterial);
    this.skyboxMesh.name = "SkyboxSphere";
    this.skyboxMesh.renderOrder = -1; // After starfield, before celestial bodies
    this.scene.add(this.skyboxMesh);

    this.celestialBodyMeshes = new Map();
  }

  private getOrCreateCelestialBodyMesh(bodyData: ICelestialBodyData): THREE.Mesh {
    let mesh = this.celestialBodyMeshes.get(bodyData.name);
    if (!mesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        map: bodyData.texture, // Assign texture at creation
        transparent: true,
        depthWrite: false,
        fog: false,
        // Consider THREE.AdditiveBlending for the sun if desired later
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = `CelestialBody_${bodyData.name}`;
      mesh.renderOrder = bodyData.name === 'sun' ? -0.9 : -0.8; // Sun slightly before moon
      this.scene.add(mesh);
      this.celestialBodyMeshes.set(bodyData.name, mesh);
    }
    return mesh;
  }

  public update(camera: THREE.Camera): void {
    // Update Skybox color and position
    this.skyboxMaterial.color.copy(this.skyColorProvider.getSkyColor());
    this.skyboxMesh.position.copy(camera.position);

    // Update Starfield position and intensity
    this.starfield.update(camera.position, this.skyColorProvider.getStarfieldIntensity());

    // Update Celestial Bodies
    const bodiesData = this.celestialBodyController.getRenderableBodiesData();
    
    const activeBodyNamesThisFrame = new Set(bodiesData.map(bd => bd.name));

    // Hide meshes for bodies that are no longer active or should be invisible
    this.celestialBodyMeshes.forEach((mesh, name) => {
      if (!activeBodyNamesThisFrame.has(name)) {
        mesh.visible = false;
      }
    });

    for (const bodyData of bodiesData) {
      const mesh = this.getOrCreateCelestialBodyMesh(bodyData);
      const material = mesh.material as THREE.MeshBasicMaterial;

      if (bodyData.isVisible && bodyData.intensity > 0.01) {
        mesh.visible = true;
        mesh.position.copy(bodyData.position);
        mesh.scale.set(bodyData.size, bodyData.size, 1);
        mesh.lookAt(camera.position);

        if (material.map !== bodyData.texture) { // Update texture only if it changed
            material.map = bodyData.texture;
            material.needsUpdate = true;
        }
        material.color.copy(bodyData.color); // Sun/Moon might have slight color tint
        material.opacity = bodyData.intensity;
        
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
      (mesh.material as THREE.Material).map?.dispose(); // Dispose map if material has one
      (mesh.material as THREE.Material).dispose();
    });
    this.celestialBodyMeshes.clear();

    this.starfield.dispose(); // Call Starfield's own dispose method
  }
}
