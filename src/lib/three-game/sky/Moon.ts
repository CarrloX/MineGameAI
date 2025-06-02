
import * as THREE from 'three';
import type { ICelestialBody, ICelestialBodyData } from './ICelestialBody';

export class Moon implements ICelestialBody {
  public name: string = 'moon';
  private texture: THREE.Texture | null = null; // Set to null, no external texture
  private size: number;
  private orbitalPathRadius: number;
  private renderData: ICelestialBodyData;

  constructor(textureLoader: THREE.TextureLoader, orbitalPathRadius: number = 380, size: number = 40) {
    this.size = size;
    this.orbitalPathRadius = orbitalPathRadius;

    // No texture loading from placehold.co for the Moon
    // (textureLoader is passed but not used for Moon's own texture)

    this.renderData = {
      name: this.name,
      position: new THREE.Vector3(),
      texture: this.texture, // Will be null
      size: this.size,
      color: new THREE.Color(0xe0e0f0), // Base color for the moon if no texture
      intensity: 0,
      isVisible: false,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    const nightPortionStart = 0.75; // Night starts
    const nightPortionEnd = 0.25;   // Night ends (next day)

    // Moon is visible from sunset through night to sunrise
    let isNightVisiblePhase1 = timeNormalized >= nightPortionStart && timeNormalized <= 1.0; // Evening to midnight
    let isNightVisiblePhase2 = timeNormalized >= 0.0 && timeNormalized <= nightPortionEnd;   // Midnight to morning
    this.renderData.isVisible = isNightVisiblePhase1 || isNightVisiblePhase2;

    if (this.renderData.isVisible) {
        // Calculate moon's progress through its visible arc (approx -PI/2 to PI/2 for y position)
        // This logic positions the moon opposite the sun's path.
        let moonProgress;
        // If current time is from nightPortionStart (e.g. 0.75) to 1.0
        if (timeNormalized >= nightPortionStart) {
            // moonProgress goes from 0 (at 0.75) to 0.5 (at 1.0, which is equivalent to 0.0 for progress calc)
            // Total duration of this segment is 1.0 - 0.75 = 0.25
            // Moon rises at 0.75, is highest at (0.75 + 0.25) = 1.0 (midnight), sets at (1.0 + 0.25) = 0.25 next day
            moonProgress = (timeNormalized - nightPortionStart) / ((1.0 - nightPortionStart) + nightPortionEnd);
        } else { // current time is from 0.0 to nightPortionEnd (e.g. 0.25)
            // moonProgress continues from 0.5 (at 0.0) to 1.0 (at 0.25)
            moonProgress = ((1.0 - nightPortionStart) + timeNormalized) / ((1.0 - nightPortionStart) + nightPortionEnd);
        }
        
        // moonAngle goes from approx -PI/2 (moonrise) to PI/2 (moonset) relative to Z-axis, Y-up
        // This is a simplified orbital path; a more realistic one would be more complex.
        // We want moon to be high at midnight (timeNormalized = 0 or 1)
        const moonAngle = (moonProgress - 0.5) * Math.PI; // Centered around midnight

        this.renderData.position.x = Math.cos(moonAngle) * this.orbitalPathRadius * 0.9; // East-West movement
        this.renderData.position.y = Math.sin(moonAngle) * this.orbitalPathRadius * 0.5; // Up-Down movement
        this.renderData.position.z = -Math.sin(moonAngle) * Math.cos(moonAngle) * this.orbitalPathRadius * 0.3; // Slight North-South wobble

        // Make position relative to camera
        this.renderData.position.add(cameraPosition);
        // Ensure moon is not too low, clip its y position if needed
        this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius * 0.15, this.renderData.position.y);


        // Intensity based on height (similar to sun, but for night)
        const peakIntensity = 0.8;
        const horizonIntensity = 0.1; // Moon can be dimmer at horizon
        // moonHeightFactor based on sin of progress (0 at horizon, 1 at peak)
        let moonHeightFactor = Math.sin(moonProgress * Math.PI); 
        moonHeightFactor = Math.max(0, moonHeightFactor); // Ensure positive
        
        this.renderData.intensity = horizonIntensity + (peakIntensity - horizonIntensity) * moonHeightFactor;
    } else {
      this.renderData.intensity = 0;
    }
  }

  getRenderData(): ICelestialBodyData {
    return this.renderData;
  }

  dispose(): void {
    // No texture to dispose for the Moon itself
  }
}
