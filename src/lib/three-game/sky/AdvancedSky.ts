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

export interface AdvancedSkyOptions {
  /**
   * Duración del día en minutos (por defecto: 20)
   */
  dayDurationMinutes?: number;
  /**
   * Factor para el radio orbital del sol (por defecto: 0.8)
   */
  sunOrbitalRadiusFactor?: number;
  /**
   * Factor para el radio orbital de la luna (por defecto: 0.75)
   */
  moonOrbitalRadiusFactor?: number;
  /**
   * Factor para el tamaño del sol (por defecto: 1.0)
   */
  sunSizeFactor?: number;
  /**
   * Factor para el tamaño de la luna (por defecto: 1.0)
   */
  moonSizeFactor?: number;
}

/**
 * AdvancedSky permite configurar el ciclo día/noche y los factores de tamaño/orbita de sol y luna.
 * Ejemplo de uso:
 *
 *   const sky = new AdvancedSky(scene, loader, 8, 32, {
 *     dayDurationMinutes: 10, // Día más corto
 *     sunOrbitalRadiusFactor: 1.0, // Sol más lejano
 *     moonOrbitalRadiusFactor: 0.7, // Luna más cercana
 *     sunSizeFactor: 1.2, // Sol más grande
 *     moonSizeFactor: 0.8 // Luna más pequeña
 *   });
 *
 * Si no se pasan opciones, se usan los valores por defecto.
 */
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
    options: AdvancedSkyOptions = {}
  ) {
    this.scene = scene;
    this.textureLoader = textureLoader;

    const maxVisibleDistance = worldRenderDistanceChunks * chunkSize; 
    const skyElementsBaseRadius = Math.max(500, maxVisibleDistance * 1.5); 

    // Usar opciones o valores por defecto
    const finalSunOrbitalRadius = skyElementsBaseRadius * (options.sunOrbitalRadiusFactor ?? 0.8);
    const finalMoonOrbitalRadius = skyElementsBaseRadius * (options.moonOrbitalRadiusFactor ?? 0.75);
    const finalSunSize = skyElementsBaseRadius * 0.05 * (options.sunSizeFactor ?? 1.0);
    const finalMoonSize = skyElementsBaseRadius * 0.04 * (options.moonSizeFactor ?? 1.0);

    this.timeManager = new TimeOfDayManager(options.dayDurationMinutes ?? 20, 0.25); 
    this.skyColorController = new SkyColorController(this.timeManager);
    this.celestialBodyController = new CelestialBodyController(this.timeManager);

    // El sol y la luna siempre serán visibles con los valores por defecto
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

  public update(deltaTime: number, camera: THREE.Camera, isCameraSubmerged: boolean = false): void {
    this.timeManager.update(deltaTime);
    this.skyColorController.updateColors(); 
    this.celestialBodyController.update(camera.position); 
    this.skyRenderer.update(camera);

    const ambientLight = this.scene.getObjectByName("Ambient Light") as THREE.AmbientLight;
    if (ambientLight) {
        ambientLight.color.copy(this.skyColorController.getAmbientLightColor());
        ambientLight.intensity = this.skyColorController.getAmbientLightIntensity();
    }
      if (this.scene.fog instanceof THREE.Fog && !isCameraSubmerged) {
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
