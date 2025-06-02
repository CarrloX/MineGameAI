
import * as THREE from 'three';
import { TimeOfDayManager } from './TimeOfDayManager';
import { SkyColorController } from './SkyColorController';
import { CelestialBodyController } from './CelestialBodyController';
import { Sun } from './Sun';
import { Moon } from './Moon';
import { Starfield } from './Starfield';
import { SkyRenderer } from './SkyRenderer';
import type { ITimeProvider } from './ITimeProvider';
import type { ISkyColorProvider } from './ISkyColorProvider';

export class AdvancedSky {
  private scene: THREE.Scene;
  private textureLoader: THREE.TextureLoader;
  
  public timeManager: TimeOfDayManager;
  public skyColorController: SkyColorController;
  public celestialBodyController: CelestialBodyController;
  private skyRenderer: SkyRenderer;
  private starfield: Starfield;

  public sun: Sun; // Expose sun for direct light access if needed
  public moon: Moon;


  constructor(
    scene: THREE.Scene,
    textureLoader: THREE.TextureLoader,
    worldRenderDistanceChunks: number, // For configuring celestial body distances
    chunkSize: number // For configuring celestial body distances
  ) {
    this.scene = scene;
    this.textureLoader = textureLoader;

    this.timeManager = new TimeOfDayManager(20, 0.25); // 20 min cycle, start at 6 AM
    this.skyColorController = new SkyColorController(this.timeManager);
    this.celestialBodyController = new CelestialBodyController(this.timeManager);

    const baseSkyRadius = worldRenderDistanceChunks * chunkSize * 1.5; // Make skybox larger than render distance

    this.sun = new Sun(this.textureLoader, this.scene, baseSkyRadius * 0.8, baseSkyRadius * 0.05);
    this.moon = new Moon(this.textureLoader, baseSkyRadius * 0.75, baseSkyRadius * 0.04);
    
    this.celestialBodyController.addBody(this.sun);
    this.celestialBodyController.addBody(this.moon);

    this.starfield = new Starfield(this.scene, this.textureLoader, baseSkyRadius * 1.1);

    this.skyRenderer = new SkyRenderer(
      this.scene,
      this.textureLoader,
      this.skyColorController,
      this.celestialBodyController,
      this.starfield,
      baseSkyRadius
    );
  }

  public update(deltaTime: number, camera: THREE.Camera): void {
    this.timeManager.update(deltaTime);
    this.skyColorController.updateColors();
    this.celestialBodyController.update(camera.position); // Sun/Moon update before renderer
    this.skyRenderer.update(camera);

    // Update scene fog
    this.scene.fog = new THREE.Fog(
        this.skyColorController.getFogColor(),
        (this.scene.fog as THREE.Fog)?.near || 10, // Keep near/far if already set, or use defaults
        (this.scene.fog as THREE.Fog)?.far || 1000
    );
    
    // Update ambient light (assuming one global ambient light is managed elsewhere or added here)
    const ambient = this.scene.getObjectByName("Ambient Light") as THREE.AmbientLight;
    if (ambient) {
        ambient.color.copy(this.skyColorController.getAmbientLightColor());
        ambient.intensity = this.skyColorController.getAmbientLightIntensity();
    }
  }
  
  // Expose providers if other systems need them
  public getTimeProvider(): ITimeProvider {
    return this.timeManager;
  }

  public getSkyColorProvider(): ISkyColorProvider {
    return this.skyColorController;
  }

  public dispose(): void {
    this.skyRenderer.dispose(); // Disposes skybox, celestial meshes, starfield mesh
    this.celestialBodyController.dispose(); // Disposes sun/moon textures, lights
    // TimeManager and SkyColorController don't hold THREE resources directly
  }
}
