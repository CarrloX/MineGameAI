
import type * as THREE from 'three';
import type { ICelestialBody, ICelestialBodyData } from './ICelestialBody';
import type { ITimeProvider } from './ITimeProvider';

export class CelestialBodyController {
  private timeProvider: ITimeProvider;
  private celestialBodies: ICelestialBody[];

  constructor(timeProvider: ITimeProvider) {
    this.timeProvider = timeProvider;
    this.celestialBodies = [];
  }

  public addBody(body: ICelestialBody): void {
    this.celestialBodies.push(body);
  }

  public update(cameraPosition: THREE.Vector3): void {
    const timeNormalized = this.timeProvider.getCurrentTimeNormalized();
    for (const body of this.celestialBodies) {
      body.update(timeNormalized, cameraPosition);
    }
  }

  public getRenderableBodiesData(): ICelestialBodyData[] {
    return this.celestialBodies.map(body => body.getRenderData()).filter(data => data.isVisible);
  }
  
  public getBodyByName(name: string): ICelestialBody | undefined {
    // This assumes celestial bodies will have a name property or similar identifier
    return this.celestialBodies.find(body => (body as any).name === name);
  }

  public dispose(): void {
    for (const body of this.celestialBodies) {
      body.dispose();
    }
    this.celestialBodies = [];
  }
}
