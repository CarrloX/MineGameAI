
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
    });
    (this.texture as any) = {'data-ai-hint': 'moon cratered'};


    this.renderData = {
      position: new THREE.Vector3(),
      texture: this.texture,
      size: this.size,
      color: new THREE.Color(0xf0f0ff),
      intensity: 0,
      isVisible: false,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    // Moon is up opposite the sun. Roughly from time 0.75 (sunset) through 0.0/1.0 (midnight) to 0.25 (sunrise)
    // Moon angle: 0 at "moonrise" (sunset time), PI at "moonset" (sunrise time)
    let moonTimeNormalized = timeNormalized + 0.5; // Shift time so moon cycle is 0 to 1
    if (moonTimeNormalized >= 1.0) moonTimeNormalized -= 1.0;

    const moonAngle = (moonTimeNormalized - 0.25) * Math.PI / 0.5;

    this.renderData.isVisible = moonTimeNormalized >= 0.25 && moonTimeNormalized <= 0.75; // Visible during its "day" (our night)

    if (this.renderData.isVisible) {
      this.renderData.position.x = Math.cos(moonAngle) * this.orbitalPathRadius;
      this.renderData.position.y = Math.sin(moonAngle) * this.orbitalPathRadius * 0.6;
      this.renderData.position.z = Math.sin(moonAngle) * this.orbitalPathRadius * 0.3; // Slight z offset for variation

      this.renderData.position.add(cameraPosition);
      this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius*0.2, this.renderData.position.y);

      const peakIntensity = 0.7;
      const horizonIntensity = 0.1;
      let moonUpDownFactor = Math.sin(moonAngle); // 0 at horizon, 1 at moon-noon, 0 at horizon
      moonUpDownFactor = Math.max(0, moonUpDownFactor);
      this.renderData.intensity = horizonIntensity + (peakIntensity - horizonIntensity) * moonUpDownFactor;
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
