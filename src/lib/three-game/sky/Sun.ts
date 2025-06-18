import * as THREE from "three";
import type { ICelestialBody, ICelestialBodyData } from "./ICelestialBody";

export class Sun implements ICelestialBody {
  public name: string = "sun";
  private texture: THREE.Texture | null = null;
  private size: number;
  private orbitalPathRadius: number;
  public light: THREE.DirectionalLight;
  private renderData: ICelestialBodyData;
  private currentPosition: THREE.Vector3;

  constructor(
    private scene: THREE.Scene,
    orbitalPathRadius: number = 400,
    size: number = 50
  ) {
    this.size = size;
    this.orbitalPathRadius = orbitalPathRadius;
    this.currentPosition = new THREE.Vector3();

    // Configuración de la luz direccional sin sombras
    this.light = new THREE.DirectionalLight(0xffffff, 0.0);
    this.light.name = "SunDirectionalLight";
    this.light.castShadow = false; // Las sombras ahora se manejarán por el servicio
    // Ya no se añade la luz ni el target a la escena aquí.

    this.renderData = {
      name: this.name,
      position: new THREE.Vector3(),
      texture: this.texture,
      size: this.size,
      color: new THREE.Color(0xffffee), // Color base del sol
      intensity: 1.0,
      isVisible: false,
      lightPosition: new THREE.Vector3(),
      lightColor: new THREE.Color(0xffffff),
      lightIntensity: 0,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    const dayPortionStart = 0.25;
    const dayPortionEnd = 0.75;
    // const dayDuration = dayPortionEnd - dayPortionStart; // Not used

    this.renderData.isVisible =
      timeNormalized >= dayPortionStart && timeNormalized <= dayPortionEnd;

    if (this.renderData.isVisible) {
      const noonAngle = (timeNormalized - 0.5) * 2 * Math.PI;

      this.renderData.position.x =
        -Math.sin(noonAngle) * this.orbitalPathRadius;
      this.renderData.position.y =
        Math.cos(noonAngle) * this.orbitalPathRadius * 0.6;
      this.renderData.position.z =
        Math.sin(noonAngle) *
        Math.cos(noonAngle) *
        this.orbitalPathRadius *
        0.2;

      this.renderData.position.add(cameraPosition);
      this.renderData.position.y = Math.max(
        cameraPosition.y - this.orbitalPathRadius * 0.1,
        this.renderData.position.y
      );

      this.renderData.lightPosition.copy(this.renderData.position);

      // Calcular la intensidad y color de la luz solar para el servicio de iluminación
      const peakVisualIntensity = 1.0;
      const horizonVisualIntensity = 0.3;
      const peakLightIntensity = 1.0;
      const horizonLightIntensity = 0.3;

      let sunHeightFactor = Math.cos(noonAngle);
      sunHeightFactor = Math.max(0, sunHeightFactor);

      this.renderData.intensity =
        horizonLightIntensity +
        (peakLightIntensity - horizonLightIntensity) * sunHeightFactor;

      const morningColor = new THREE.Color(0xffebcd); // Light Orange/Yellow
      const noonColor = new THREE.Color(0xffffff); // White
      const eveningColor = new THREE.Color(0xffdab9); // Lighter Orange/Pink

      // Visual colors for el disco solar
      const visualMorningColor = new THREE.Color(0xffccaa);
      const visualNoonColor = new THREE.Color(0xffffee); // Very light yellow/white
      const visualEveningColor = new THREE.Color(0xffaa88);

      if (timeNormalized < 0.5) {
        // Before noon
        const t = (timeNormalized - dayPortionStart) / (0.5 - dayPortionStart);
        this.renderData.color.lerpColors(
          visualMorningColor,
          visualNoonColor,
          t
        );
        this.renderData.lightColor.lerpColors(morningColor, noonColor, t);
      } else {
        // After noon
        const t = (timeNormalized - 0.5) / (dayPortionEnd - 0.5);
        this.renderData.color.lerpColors(
          visualNoonColor,
          visualEveningColor,
          t
        );
        this.renderData.lightColor.lerpColors(noonColor, eveningColor, t);
      }
      this.renderData.lightIntensity = this.renderData.intensity;
    } else {
      this.renderData.intensity = 0;
      this.renderData.lightIntensity = 0;
    }
  }

  getRenderData(): ICelestialBodyData {
    return this.renderData;
  }

  dispose(): void {
    // No texture to dispose for the Sun itself
    if (this.light.parent) this.light.parent.remove(this.light);
    if (this.light.target && this.light.target.parent)
      this.light.target.parent.remove(this.light.target);
  }
}
