
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

  public sun: Sun;
  private moon: Moon;


  constructor(
    scene: THREE.Scene,
    textureLoader: THREE.TextureLoader,
    worldRenderDistanceChunks: number, 
    chunkSize: number,
    dayDurationMinutes?: number,
    sunOrbitalRadiusFactor?: number,
    moonOrbitalRadiusFactor?: number,
    sunSizeFactor?: number,
    moonSizeFactor?: number
  ) {
    this.scene = scene;
    this.textureLoader = textureLoader;

    const maxVisibleDistance = worldRenderDistanceChunks * chunkSize; 
    const skyElementsBaseRadius = Math.max(500, maxVisibleDistance * 1.5); 

    // Determine final orbital radii and sizes using factors or defaults
    const finalSunOrbitalRadius = skyElementsBaseRadius * (sunOrbitalRadiusFactor ?? 0.8);
    const finalMoonOrbitalRadius = skyElementsBaseRadius * (moonOrbitalRadiusFactor ?? 0.75);
    const finalSunSize = skyElementsBaseRadius * 0.05 * (sunSizeFactor ?? 1.0);
    const finalMoonSize = skyElementsBaseRadius * 0.04 * (moonSizeFactor ?? 1.0);

    this.timeManager = new TimeOfDayManager(dayDurationMinutes ?? 20, 0.25); 
    this.skyColorController = new SkyColorController(this.timeManager);
    this.celestialBodyController = new CelestialBodyController(this.timeManager);

    this.sun = new Sun(this.textureLoader, this.scene, finalSunOrbitalRadius, finalSunSize);
    this.celestialBodyController.addBody(this.sun);

    this.moon = new Moon(this.textureLoader, finalMoonOrbitalRadius, finalMoonSize);
    this.celestialBodyController.addBody(this.moon);

    this.starfield = new Starfield(this.scene, this.textureLoader, skyElementsBaseRadius * 1.1);

    this.skyRenderer = new SkyRenderer(
      this.scene,
      this.textureLoader,
      this.skyColorController,
      this.celestialBodyController,
      this.starfield,
      skyElementsBaseRadius 
    );
  }

  public update(deltaTime: number, camera: THREE.Camera): void {
    this.timeManager.update(deltaTime);
    this.skyColorController.updateColors(); 
    this.celestialBodyController.update(camera.position); 
    this.skyRenderer.update(camera);

    const ambientLight = this.scene.getObjectByName("Ambient Light") as THREE.AmbientLight;
    if (ambientLight) {
        ambientLight.color.copy(this.skyColorController.getAmbientLightColor());
        ambientLight.intensity = this.skyColorController.getAmbientLightIntensity();
    }
    
    const playerIsNotSubmerged = true; 
    if (this.scene.fog instanceof THREE.Fog && playerIsNotSubmerged) {
        this.scene.fog.color.copy(this.skyColorController.getFogColor());
    }
  }
  
  public dispose(): void {
    this.skyRenderer.dispose(); 
    this.celestialBodyController.dispose(); 
    // TimeOfDayManager and SkyColorController do not have Three.js resources to dispose of.
  }

  public getSunLight(): THREE.DirectionalLight | null {
    return this.sun ? this.sun.light : null;
  }

  public getTimeProvider(): ITimeProvider {
    return this.timeManager;
  }

  public getSkyColorProvider(): ISkyColorProvider {
    return this.skyColorController;
  }
}
