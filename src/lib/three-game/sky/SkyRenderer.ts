
import * as THREE from 'three';
import type { ISkyColorProvider } from './ISkyColorProvider';
import type { CelestialBodyController } from './CelestialBodyController';
import type { Starfield } from './Starfield';

export class SkyRenderer {
  private scene: THREE.Scene;
  private textureLoader: THREE.TextureLoader;
  private skyColorProvider: ISkyColorProvider;
  private celestialBodyController: CelestialBodyController;
  
  private skyboxMesh: THREE.Mesh | null = null;
  private skyboxMaterial: THREE.MeshBasicMaterial | null = null;

  private sunMesh: THREE.Mesh | null = null;
  private moonMesh: THREE.Mesh | null = null;
  private celestialBodyMaterial: THREE.SpriteMaterial | THREE.MeshBasicMaterial;

  private starfield: Starfield;


  constructor(
    scene: THREE.Scene,
    textureLoader: THREE.TextureLoader,
    skyColorProvider: ISkyColorProvider,
    celestialBodyController: CelestialBodyController,
    starfield: Starfield,
    skyboxRadius: number = 1000
  ) {
    this.scene = scene;
    this.textureLoader = textureLoader;
    this.skyColorProvider = skyColorProvider;
    this.celestialBodyController = celestialBodyController;
    this.starfield = starfield;

    // Skybox
    const skyboxGeometry = new THREE.SphereGeometry(skyboxRadius, 32, 16); // Or BoxGeometry
    this.skyboxMaterial = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false, // Render behind everything
      fog: false, // Skybox itself should not be affected by scene fog
    });
    this.skyboxMesh = new THREE.Mesh(skyboxGeometry, this.skyboxMaterial);
    this.skyboxMesh.name = "SkyboxSphere";
    this.skyboxMesh.renderOrder = -1; // Render before most things but after starfield
    this.scene.add(this.skyboxMesh);

    // Material for Sun/Moon (using Sprites for simplicity, always face camera)
    // Alternatively, use MeshBasicMaterial on a PlaneGeometry
    this.celestialBodyMaterial = new THREE.SpriteMaterial({
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending, // Or NormalBlending if textures have alpha
        transparent: true,
    });
  }

  public update(camera: THREE.Camera): void {
    // Update Skybox color
    if (this.skyboxMaterial) {
      this.skyboxMaterial.color.copy(this.skyColorProvider.getSkyColor());
    }
    // Keep skybox centered on camera
    if (this.skyboxMesh) {
      this.skyboxMesh.position.copy(camera.position);
    }

    // Update Starfield
    this.starfield.update(camera.position, this.skyColorProvider.getStarfieldIntensity());

    // Update and render celestial bodies
    const bodiesData = this.celestialBodyController.getRenderableBodiesData();

    // Naive way: remove and re-add sprites/meshes. Better: update existing ones.
    // For now, let's manage sun and moon meshes directly
    
    // Sun
    const sunData = this.celestialBodyController.getBodyByName('sun')?.getRenderData();
    if (sunData && sunData.isVisible && sunData.texture) {
        if (!this.sunMesh) {
            const sunGeometry = new THREE.PlaneGeometry(1,1); // We'll scale the mesh
            const sunMaterial = new THREE.MeshBasicMaterial({
                map: sunData.texture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                fog: false,
            });
            this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
            this.sunMesh.name = "SunMesh";
            this.sunMesh.renderOrder = 10; // Render on top
            this.scene.add(this.sunMesh);
        }
        this.sunMesh.position.copy(sunData.position);
        this.sunMesh.scale.setScalar(sunData.size);
        this.sunMesh.lookAt(camera.position); // Make plane face camera
        (this.sunMesh.material as THREE.MeshBasicMaterial).color.set(sunData.color);
        (this.sunMesh.material as THREE.MeshBasicMaterial).opacity = sunData.intensity;
        (this.sunMesh.material as THREE.MeshBasicMaterial).map = sunData.texture; 
        this.sunMesh.visible = true;
    } else if (this.sunMesh) {
        this.sunMesh.visible = false;
    }

    // Moon
    const moonData = this.celestialBodyController.getBodyByName('moon')?.getRenderData();
    if (moonData && moonData.isVisible && moonData.texture) {
        if (!this.moonMesh) {
            const moonGeometry = new THREE.PlaneGeometry(1,1);
            const moonMaterial = new THREE.MeshBasicMaterial({
                map: moonData.texture,
                transparent: true,
                // blending: THREE.NormalBlending, // if texture has alpha for phases
                depthWrite: false,
                fog: false,
            });
            this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
            this.moonMesh.name = "MoonMesh";
            this.moonMesh.renderOrder = 9; // Render on top, but below sun if overlap
            this.scene.add(this.moonMesh);
        }
        this.moonMesh.position.copy(moonData.position);
        this.moonMesh.scale.setScalar(moonData.size);
        this.moonMesh.lookAt(camera.position);
        (this.moonMesh.material as THREE.MeshBasicMaterial).color.set(moonData.color);
        (this.moonMesh.material as THREE.MeshBasicMaterial).opacity = moonData.intensity;
        (this.moonMesh.material as THREE.MeshBasicMaterial).map = moonData.texture;
        this.moonMesh.visible = true;
    } else if (this.moonMesh) {
        this.moonMesh.visible = false;
    }
  }

  public dispose(): void {
    if (this.skyboxMesh) {
      this.scene.remove(this.skyboxMesh);
      this.skyboxMesh.geometry.dispose();
    }
    this.skyboxMaterial?.dispose();
    
    if (this.sunMesh) {
        this.scene.remove(this.sunMesh);
        this.sunMesh.geometry.dispose();
        (this.sunMesh.material as THREE.Material).dispose();
    }
    if (this.moonMesh) {
        this.scene.remove(this.moonMesh);
        this.moonMesh.geometry.dispose();
        (this.moonMesh.material as THREE.Material).dispose();
    }
    
    this.starfield.dispose(); // Starfield manages its own scene removal if added
    if (this.scene.getObjectByName(this.starfield.mesh.name)) {
        this.scene.remove(this.starfield.mesh);
    }

  }
}
