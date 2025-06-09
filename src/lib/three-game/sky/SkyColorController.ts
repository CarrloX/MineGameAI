import * as THREE from "three";
import type { ITimeProvider } from "./ITimeProvider";
import type { ISkyColorProvider } from "./ISkyColorProvider";

interface ColorStop {
  time: number; // Normalized time (0.0 to 1.0)
  skyColor: THREE.Color;
  fogColor: THREE.Color;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  starIntensity: number;
}

export class SkyColorController implements ISkyColorProvider {
  private timeProvider: ITimeProvider;
  private colorStops: ColorStop[];

  private currentSkyColor: THREE.Color;
  private currentFogColor: THREE.Color;
  private currentAmbientColor: THREE.Color;
  private currentAmbientIntensity: number;
  private currentStarIntensity: number;

  constructor(timeProvider: ITimeProvider) {
    this.timeProvider = timeProvider;

    // Define default color stops for a day-night cycle
    // Times are normalized: 0.0/1.0=midnight, 0.25=sunrise, 0.5=midday, 0.75=sunset
    this.colorStops = [
      {
        time: 0.0,
        skyColor: new THREE.Color(0x000010),
        fogColor: new THREE.Color(0x000005),
        ambientColor: new THREE.Color(0x101020),
        ambientIntensity: 0.1,
        starIntensity: 1.0,
      }, // Midnight
      {
        time: 0.2,
        skyColor: new THREE.Color(0x101030),
        fogColor: new THREE.Color(0x050515),
        ambientColor: new THREE.Color(0x202030),
        ambientIntensity: 0.2,
        starIntensity: 1.0,
      }, // Predawn
      {
        time: 0.25,
        skyColor: new THREE.Color(0xff8c00),
        fogColor: new THREE.Color(0xffdab9),
        ambientColor: new THREE.Color(0x806040),
        ambientIntensity: 0.4,
        starIntensity: 0.5,
      }, // Sunrise
      {
        time: 0.3,
        skyColor: new THREE.Color(0x87ceeb),
        fogColor: new THREE.Color(0xa0d8ef),
        ambientColor: new THREE.Color(0x707090),
        ambientIntensity: 0.8,
        starIntensity: 0.0,
      }, // Morning
      {
        time: 0.5,
        skyColor: new THREE.Color(0x87cefa),
        fogColor: new THREE.Color(0xb0e0f0),
        ambientColor: new THREE.Color(0x9090a0),
        ambientIntensity: 1.0,
        starIntensity: 0.0,
      }, // Midday
      {
        time: 0.7,
        skyColor: new THREE.Color(0xffd700),
        fogColor: new THREE.Color(0xffe4b5),
        ambientColor: new THREE.Color(0x707090),
        ambientIntensity: 0.8,
        starIntensity: 0.0,
      }, // Afternoon
      {
        time: 0.75,
        skyColor: new THREE.Color(0xff4500),
        fogColor: new THREE.Color(0xffb6c1),
        ambientColor: new THREE.Color(0x804040),
        ambientIntensity: 0.4,
        starIntensity: 0.5,
      }, // Sunset
      {
        time: 0.8,
        skyColor: new THREE.Color(0x101030),
        fogColor: new THREE.Color(0x050515),
        ambientColor: new THREE.Color(0x202030),
        ambientIntensity: 0.2,
        starIntensity: 1.0,
      }, // Dusk
      {
        time: 1.0,
        skyColor: new THREE.Color(0x000010),
        fogColor: new THREE.Color(0x000005),
        ambientColor: new THREE.Color(0x101020),
        ambientIntensity: 0.1,
        starIntensity: 1.0,
      }, // Midnight (repeat for smooth interpolation)
    ];
    this.colorStops.sort((a, b) => a.time - b.time);

    this.currentSkyColor = new THREE.Color();
    this.currentFogColor = new THREE.Color();
    this.currentAmbientColor = new THREE.Color();
    this.currentAmbientIntensity = 0;
    this.currentStarIntensity = 0;

    this.updateColors(); // Initialize colors
  }

  public updateColors(): void {
    const time = this.timeProvider.getCurrentTimeNormalized();

    let prevStop = this.colorStops[this.colorStops.length - 1];
    let nextStop = this.colorStops[0];

    for (let i = 0; i < this.colorStops.length; i++) {
      if (this.colorStops[i].time >= time) {
        nextStop = this.colorStops[i];
        prevStop =
          this.colorStops[i - 1] || this.colorStops[this.colorStops.length - 1]; // Handle wrap around for first stop
        break;
      }
    }

    // Adjust for wrap-around interpolation if time is between last stop and first stop (e.g., 0.9 to 0.1 via 1.0/0.0)
    let t;
    if (prevStop.time > nextStop.time) {
      // Wrap around midnight
      const durationSegment = 1.0 - prevStop.time + nextStop.time;
      if (time >= prevStop.time) {
        // Current time is in the segment before midnight
        t = (time - prevStop.time) / durationSegment;
      } else {
        // Current time is in the segment after midnight
        t = (1.0 - prevStop.time + time) / durationSegment;
      }
    } else {
      const durationSegment = nextStop.time - prevStop.time;
      t = durationSegment === 0 ? 0 : (time - prevStop.time) / durationSegment;
    }
    t = Math.max(0, Math.min(1, t)); // Clamp t to [0, 1]

    this.currentSkyColor.lerpColors(prevStop.skyColor, nextStop.skyColor, t);
    this.currentFogColor.lerpColors(prevStop.fogColor, nextStop.fogColor, t);
    this.currentAmbientColor.lerpColors(
      prevStop.ambientColor,
      nextStop.ambientColor,
      t
    );
    this.currentAmbientIntensity =
      prevStop.ambientIntensity +
      (nextStop.ambientIntensity - prevStop.ambientIntensity) * t;
    this.currentStarIntensity =
      prevStop.starIntensity +
      (nextStop.starIntensity - prevStop.starIntensity) * t;
  }

  public getSkyColor(): THREE.Color {
    return this.currentSkyColor;
  }

  public getFogColor(): THREE.Color {
    return this.currentFogColor;
  }

  public getAmbientLightColor(): THREE.Color {
    return this.currentAmbientColor;
  }

  public getAmbientLightIntensity(): number {
    return this.currentAmbientIntensity;
  }

  public getStarfieldIntensity(): number {
    return this.currentStarIntensity;
  }
}
