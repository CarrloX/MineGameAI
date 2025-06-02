
import * as THREE from 'three';
import type { ICelestialBody, ICelestialBodyData } from './ICelestialBody';

export class Moon implements ICelestialBody {
  public name: string = 'moon';
  private texture: THREE.Texture | null = null;
  private size: number;
  private orbitalPathRadius: number;
  private renderData: ICelestialBodyData;

  constructor(textureLoader: THREE.TextureLoader, orbitalPathRadius: number = 380, size: number = 40) {
    this.size = size;
    this.orbitalPathRadius = orbitalPathRadius;

    textureLoader.load('https://placehold.co/128x128/E0E0E0/E0E0E0.png?text=.', (tex) => {
      this.texture = tex;
      if (this.renderData) this.renderData.texture = this.texture;
      (this.texture as any)['data-ai-hint'] = 'moon cratered';
    });


    this.renderData = {
      position: new THREE.Vector3(),
      texture: this.texture,
      size: this.size,
      color: new THREE.Color(0xf0f0ff),
      intensity: 0, // Starts with 0 intensity
      isVisible: false,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    // Moon is up opposite the sun. Roughly from time 0.75 (sunset) through 0.0/1.0 (midnight) to 0.25 (sunrise)
    const nightPortionStart = 0.75; // Sunset
    const nightPortionEnd = 0.25;   // Sunrise (of next day, so effectively 1.25 for calculation)

    let isNightVisiblePhase1 = timeNormalized >= nightPortionStart && timeNormalized <= 1.0;
    let isNightVisiblePhase2 = timeNormalized >= 0.0 && timeNormalized <= nightPortionEnd;
    this.renderData.isVisible = isNightVisiblePhase1 || isNightVisiblePhase2;

    if (this.renderData.isVisible) {
        // Moon angle, 0 at midnight, PI at "moon-midday" (which is our midday, when moon is not visible)
        // We want angle to make it rise at sunset (0.75) and set at sunrise (0.25)
        // Let moon's "day" start at sunset (timeNormalized = 0.75) and end at sunrise (timeNormalized = 0.25 of next day)
        // Duration of moon's visibility = (1.0 - 0.75) + 0.25 = 0.5
        let moonProgress;
        if (timeNormalized >= 0.75) { // From sunset to midnight
            moonProgress = (timeNormalized - 0.75) / 0.5;
        } else { // From midnight to sunrise
            moonProgress = ((1.0 - 0.75) + timeNormalized) / 0.5;
        }
        const moonAngle = (moonProgress - 0.5) * Math.PI; // -PI/2 at moonrise, PI/2 at moonset

        this.renderData.position.x = Math.cos(moonAngle) * this.orbitalPathRadius * 0.9; // Moon often appears a bit lower
        this.renderData.position.y = Math.sin(moonAngle) * this.orbitalPathRadius * 0.5;
        this.renderData.position.z = -Math.sin(moonAngle) * Math.cos(moonAngle) * this.orbitalPathRadius * 0.3; // Different wobble from sun

        this.renderData.position.add(cameraPosition);
        this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius * 0.15, this.renderData.position.y);

        const peakIntensity = 0.8;
        const horizonIntensity = 0.2;
        // moonHeightFactor: 0 at horizon, 1 at its highest point (midnight)
        let moonHeightFactor = Math.sin(moonProgress * Math.PI); // sin(0)=0, sin(PI/2)=1, sin(PI)=0
        moonHeightFactor = Math.max(0, moonHeightFactor);
        
        this.renderData.intensity = horizonIntensity + (peakIntensity - horizonIntensity) * moonHeightFactor;
    } else {
      this.renderData.intensity = 0;
    }
  }

  getRenderData(): ICelestialBodyData {
    return this.renderData;
  }

  dispose(): void {
    this.texture?.dispose();
  }
}
