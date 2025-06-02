
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
      name: this.name,
      position: new THREE.Vector3(),
      texture: this.texture,
      size: this.size,
      color: new THREE.Color(0xf0f0ff),
      intensity: 0,
      isVisible: false,
    };
  }

  update(timeNormalized: number, cameraPosition: THREE.Vector3): void {
    const nightPortionStart = 0.75;
    const nightPortionEnd = 0.25;

    let isNightVisiblePhase1 = timeNormalized >= nightPortionStart && timeNormalized <= 1.0;
    let isNightVisiblePhase2 = timeNormalized >= 0.0 && timeNormalized <= nightPortionEnd;
    this.renderData.isVisible = isNightVisiblePhase1 || isNightVisiblePhase2;

    if (this.renderData.isVisible) {
        let moonProgress;
        if (timeNormalized >= 0.75) {
            moonProgress = (timeNormalized - 0.75) / 0.5;
        } else {
            moonProgress = ((1.0 - 0.75) + timeNormalized) / 0.5;
        }
        const moonAngle = (moonProgress - 0.5) * Math.PI;

        this.renderData.position.x = Math.cos(moonAngle) * this.orbitalPathRadius * 0.9;
        this.renderData.position.y = Math.sin(moonAngle) * this.orbitalPathRadius * 0.5;
        this.renderData.position.z = -Math.sin(moonAngle) * Math.cos(moonAngle) * this.orbitalPathRadius * 0.3;

        this.renderData.position.add(cameraPosition);
        this.renderData.position.y = Math.max(cameraPosition.y - this.orbitalPathRadius * 0.15, this.renderData.position.y);

        const peakIntensity = 0.8;
        const horizonIntensity = 0.2;
        let moonHeightFactor = Math.sin(moonProgress * Math.PI);
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
