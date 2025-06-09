import * as THREE from "three";
import type { ISkyColorProvider } from "./ISkyColorProvider";
import type { CelestialBodyController } from "./CelestialBodyController";
import type { Starfield } from "./Starfield";
import type { ICelestialBodyData } from "./ICelestialBody";

export class SkyRenderer {
  private scene: THREE.Scene;
  private textureLoader: THREE.TextureLoader;
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
    starfield: Starfield,
    skyboxRadius: number
  ) {
    this.scene = scene;
    this.textureLoader = textureLoader;
    this.skyColorProvider = skyColorProvider;
    this.celestialBodyController = celestialBodyController;
    this.starfield = starfield;

    const skyboxGeometry = new THREE.SphereGeometry(skyboxRadius, 32, 16);
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

  private getOrCreateCelestialBodyMesh(
    bodyData: ICelestialBodyData
  ): THREE.Mesh {
    let mesh = this.celestialBodyMeshes.get(bodyData.name);
    if (!mesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        map: bodyData.texture,
        transparent: true,
        depthWrite: false,
        fog: false,
        color: bodyData.color,
      });

      if (bodyData.name === "sun") {
        material.blending = THREE.AdditiveBlending;
      }

      mesh = new THREE.Mesh(geometry, material);
      mesh.name = `CelestialBody_${bodyData.name}`;
      mesh.renderOrder = bodyData.name === "sun" ? -0.9 : -0.8;
      this.scene.add(mesh);
      this.celestialBodyMeshes.set(bodyData.name, mesh);
    }
    return mesh;
  }

  public update(camera: THREE.Camera): void {
    this.skyboxMaterial.color.copy(this.skyColorProvider.getSkyColor());
    this.skyboxMesh.position.copy(camera.position);

    this.starfield.update(
      camera.position,
      this.skyColorProvider.getStarfieldIntensity()
    );

    const bodiesData = this.celestialBodyController.getRenderableBodiesData();

    const activeBodyNamesThisFrame = new Set(bodiesData.map((bd) => bd.name));

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

        if (material.map !== bodyData.texture && bodyData.texture) {
          material.map = bodyData.texture;
          material.needsUpdate = true;
        }
        material.color.copy(bodyData.color);
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
      if ((mesh.material as THREE.Material).map) {
        ((mesh.material as THREE.Material).map as THREE.Texture).dispose();
      }
      (mesh.material as THREE.Material).dispose();
    });
    this.celestialBodyMeshes.clear();

    this.starfield.dispose();
  }
}
