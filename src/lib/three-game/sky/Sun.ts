
import * as THREE from 'three';
import type { ICelestialBody, ICelestialBodyData } from './ICelestialBody';

export class Sun implements ICelestialBody {
  public name: string = 'sun';
  private texture: THREE.Texture | null = null; // Set to null, no external texture
  private size: number;
  private orbitalPathRadius: number;
  public light: THREE.DirectionalLight;
  private renderData: ICelestialBodyData;

  constructor(textureLoader: THREE.TextureLoader, scene: THREE.Scene, orbitalPathRadius: number = 400, size: number = 50) {
    this.size = size;
    this.orbitalPathRadius = orbitalPathRadius;

    // No texture loading from placehold.co for the Sun
    // (textureLoader is passed but not used for Sun's own texture)

    this.light = new THREE.DirectionalLight(0xffffff, 0.0);
    this.light.name = "SunDirectionalLight";
    this.light.castShadow = true;
    
    const shadowCamSize = 200;
    this.light.shadow.camera.left = -shadowCamSize;
    this.light.shadow.camera.right = shadowCamSize;
    this.light.shadow.camera.top = shadowCamSize;
    this.light.shadow.camera.bottom = -shadowCamSize;
    this.light.shadow.camera.near = 0.5;
    this.light.shadow.camera.far = orbitalPathRadius * 3;
    this.light.shadow.mapSize.width = 2048; 
    this.light.shadow.mapSize.height = 2048;
    this.light.shadow.bias = -0.001; 

    scene.add(this.light);
    if (this.light.target && !this.light.target.parent) {
        scene.add(this.light.target);
    }

    this.renderData = {
      name: this.name,
      position: new THREE.Vector3(),
      texture: this.texture, // Will be null
      size: this.size,
      color: new THREE.Color(0xffffee), // Base color for the sun if no texture
      intensity: 1.0,
      isVisible: false,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    const dayPortionStart = 0.25;
    const dayPortionEnd = 0.75;
    // const dayDuration = dayPortionEnd - dayPortionStart; // Not used

    this.renderData.isVisible = timeNormalized >= dayPortionStart && timeNormalized <= dayPortionEnd;

    if (this.renderData.isVisible) {
      const noonAngle = (timeNormalized - 0.5) * 2 * Math.PI;

      this.renderData.position.x = -Math.sin(noonAngle) * this.orbitalPathRadius;
      this.renderData.position.y = Math.cos(noonAngle) * this.orbitalPathRadius * 0.6;
      this.renderData.position.z = Math.sin(noonAngle) * Math.cos(noonAngle) * this.orbitalPathRadius * 0.2;
      
      this.renderData.position.add(cameraPosition);
      this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius * 0.1 , this.renderData.position.y);

      this.light.position.copy(this.renderData.position);
      this.light.target.position.set(cameraPosition.x, Math.max(0, cameraPosition.y - 50), cameraPosition.z); 
      this.light.target.updateMatrixWorld();

      // const noonTime = 0.5; // Not used directly in this intensity calculation
      const peakVisualIntensity = 1.0;
      const horizonVisualIntensity = 0.3;
      const peakLightIntensity = 1.0; // Increased from 0.9
      const horizonLightIntensity = 0.3; // Increased from 0.2

      let sunHeightFactor = Math.cos(noonAngle);
      sunHeightFactor = Math.max(0, sunHeightFactor);

      this.renderData.intensity = horizonVisualIntensity + (peakVisualIntensity - horizonVisualIntensity) * sunHeightFactor;
      this.light.intensity = horizonLightIntensity + (peakLightIntensity - horizonLightIntensity) * sunHeightFactor;
      
      const morningColor = new THREE.Color(0xFFEBCD); // Light Orange/Yellow
      const noonColor = new THREE.Color(0xFFFFFF);    // White
      const eveningColor = new THREE.Color(0xFFDAB9);  // Lighter Orange/Pink

      // Visual colors for the sun disk itself
      const visualMorningColor = new THREE.Color(0xffccaa);
      const visualNoonColor = new THREE.Color(0xffffee); // Very light yellow/white
      const visualEveningColor = new THREE.Color(0xffaa88);


      if (timeNormalized < 0.5) { // Before noon
          const t = (timeNormalized - dayPortionStart) / (0.5 - dayPortionStart);
          this.light.color.lerpColors(morningColor, noonColor, t);
          this.renderData.color.lerpColors(visualMorningColor, visualNoonColor, t);
      } else { // After noon
          const t = (timeNormalized - 0.5) / (dayPortionEnd - 0.5);
          this.light.color.lerpColors(noonColor, eveningColor, t);
          this.renderData.color.lerpColors(visualNoonColor, visualEveningColor, t);
      }
    } else {
      this.renderData.intensity = 0;
      this.light.intensity = 0;
    }
  }

  getRenderData(): ICelestialBodyData {
    return this.renderData;
  }

  dispose(): void {
    // No texture to dispose for the Sun itself
    if(this.light.parent) this.light.parent.remove(this.light);
    if(this.light.target && this.light.target.parent) this.light.target.parent.remove(this.light.target);
  }
}
